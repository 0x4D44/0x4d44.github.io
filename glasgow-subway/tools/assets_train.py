"""Builds models/train.glb, models/train_lod.glb and models/train_walkable.json   REVISION 4
True cross-section from research/train-dimensions.md: body 2.31 m wide, vertical sides only to y=1.487, then a single R=1.155 arch to the 2.642 m crown;
interior wall R=1.085, floor 0.695 m, centre-line headroom 1.88 m.  4 cars (12.4 + 7.0 + 7.0 + 12.4 + 3 x 0.17 m gaps = 39.3 m), 6 doors per side.
Blender frame: +Y = direction of travel (nose).  glTF: nose along -Z.  Origin: set centre, between the rails, at rail-head level.
"""
import math, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from assets_lib import *

RO, RI, CZ = 1.155, 1.085, 1.487          # outer arch radius, inner (ceiling) radius, arch centre height
W = RO
FLOOR = 0.695
GAP = 0.17
CAR_LENS = [12.4, 7.0, 7.0, 12.4]
DOORS_END = [-3.2, 1.6]; DOORS_MID = [0.2]        # car-local door centres (end cars 2, middle cars 1  -> 6 per side)
DOOR_W = 1.3                                      # opening width (single 1.2 m sliding leaf per node)
SKIRT_Z = 0.82
CAB_LEN = 1.8                                     # cab depth behind the nose (partition at t=1.8)
SILL_DEG, HEAD_DEG = 7.5, 45.0                    # window / door glazing spans the arch from 7.5 to 45 deg
CFG = dict(seat_mat='seat_moquette', pole_mat='orange_pole')

def A(R, a0, a1, step=7.5, sgn=1):
    n = max(1, int(round(abs(a1 - a0) / step)))
    return [(sgn * R * math.cos(math.radians(a0 + (a1 - a0) * i / n)), CZ + R * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def mir(pts, sg): return [(sg * x, z) for x, z in pts]

OUT_FULL = A(RO, 0, 180)                  # right belt -> crown -> left belt
ROOF_OUT = A(RO, HEAD_DEG, 180 - HEAD_DEG)
CEIL = A(RI, HEAD_DEG, 180 - HEAD_DEG)
CEIL_FULL = A(RI, 0, 180)
SECTION = [(RO, 0.62)] + OUT_FULL + [(-RO, 0.62)]         # closed outer outline

def head_room(x):
    x = abs(x)
    return 0.0 if x > RI else CZ + math.sqrt(max(0.0, RI * RI - x * x)) - FLOOR if True else 0

def arc_panel_uv(M_, sg, R0, a0, a1, y0, y1, mat, flip=False):
    """Arc strip with UV u along y, v along the arc (for wide route-map labels)."""
    pts = A(R0, a0, a1, step=2.5)
    uvl = M_.bm.loops.layers.uv.verify()
    fs = []
    for i in range(len(pts) - 1):
        p = [(sg * pts[i][0], y0, pts[i][1]), (sg * pts[i][0], y1, pts[i][1]), (sg * pts[i + 1][0], y1, pts[i + 1][1]), (sg * pts[i + 1][0], y0, pts[i + 1][1])]
        f = M_.quad(*p, mat)
        v0, v1 = i / (len(pts) - 1), (i + 1) / (len(pts) - 1)
        ls = list(f.loops)
        for l, (u, v) in zip(ls, ((0, v0), (1, v0), (1, v1), (0, v1))): l[uvl].uv = (u if sg > 0 else 1 - u, v)
        f[M_.cuv] = 1; f[M_.fx] = 1
        cx = sum(q[0] for q in p) / 4; cz = sum(q[2] for q in p) / 4
        if f.normal.x * (0 - cx) + f.normal.z * (CZ - cz) < 0: f.normal_flip()
        fs.append(f)

def build_car(idx, yc, s, root, L, DOORS, has_cab):
    HALF = L / 2
    CAB_Y = HALF - CAB_LEN if has_cab else HALF            # saloon ends here (car-local y)
    ROOFEND = HALF - 0.80 if has_cab else HALF
    lights = []
    def P(x, y, z): return (x, yc + s * y, z)
    car = group(f'car_{idx}', parent=root)
    ext = M(); sal = M(); cab = M(); gls = M()
    def ysort(a, b):
        p, q = yc + s * a, yc + s * b
        return min(p, q), max(p, q)
    def S(M_, prof, a, b, mat, **kw):
        y0, y1 = ysort(a, b); M_.strip_y(prof, y0, y1, mat, **kw)
    def quadsY(M_, ptsA, ptsB, y, mat):
        """Reveal: quad strip joining two same-length polylines at constant car-local y."""
        yy = yc + s * y
        for i in range(len(ptsA) - 1):
            f = M_.quad((ptsA[i][0], yy, ptsA[i][1]), (ptsA[i + 1][0], yy, ptsA[i + 1][1]), (ptsB[i + 1][0], yy, ptsB[i + 1][1]), (ptsB[i][0], yy, ptsB[i][1]), mat)
    AX = (0.0, CZ)
    edges = [-HALF]
    for d in DOORS: edges += [d - DOOR_W / 2, d + DOOR_W / 2]
    edges.append(CAB_Y)
    segs = [(edges[2 * k], edges[2 * k + 1]) for k in range(len(DOORS) + 1)]
    for sg in (-1, 1):
        for (a, b) in segs:
            Ln = b - a
            # ---- lower wall: black skirt + white panel up to the sill (outer), lining (inner)
            S(ext, mir([(1.05, 0.5), (1.10, 0.55), (RO, 0.62), (RO, SKIRT_Z)], sg), a, b, 'skirt_black', away=AX)
            S(ext, mir([(RO, SKIRT_Z), (RO, CZ)] + A(RO, 0, SILL_DEG), sg), a, b, 'livery_white', away=AX)
            S(sal, mir([(RI, FLOOR), (RI, CZ)] + A(RI, 0, SILL_DEG), sg), a, b, 'interior_panel', toward=AX)
            quadsY_pts = (mir([A(RO, SILL_DEG, SILL_DEG)[0]], sg), mir([A(RI, SILL_DEG, SILL_DEG)[0]], sg))
            S(ext, mir([A(RO, SILL_DEG, SILL_DEG)[0], A(RI, SILL_DEG, SILL_DEG)[0]], sg), a, b, 'interior_panel')   # sill reveal
            S(ext, mir([A(RO, HEAD_DEG, HEAD_DEG)[0], A(RI, HEAD_DEG, HEAD_DEG)[0]], sg), a, b, 'interior_panel')     # head reveal
            if has_cab and b == CAB_Y: pass
            # ---- window zone: pillars (white) and glazing
            n = max(1, int(round(Ln / 1.25))) if Ln > 0.9 else 0
            if n == 0:
                S(ext, mir(A(RO, SILL_DEG, HEAD_DEG), sg), a, b, 'livery_white', away=AX)
                S(sal, mir(A(RI, SILL_DEG, HEAD_DEG), sg), a, b, 'interior_panel', toward=AX)
                continue
            pw = 0.16 if n > 1 else 0.20; wl = (Ln - pw * (n + 1)) / n
            for k in range(n + 1):
                ya = a + k * (wl + pw); yb = ya + pw
                S(ext, mir(A(RO, SILL_DEG, HEAD_DEG), sg), ya, yb, 'livery_white', away=AX)
                S(sal, mir(A(RI, SILL_DEG, HEAD_DEG), sg), ya, yb, 'interior_panel', toward=AX)
            for k in range(n):
                ya = a + pw + k * (wl + pw); yb = ya + wl
                S(gls, mir(A(1.12, SILL_DEG, HEAD_DEG), sg), ya, yb, 'glass_window', toward=AX)
                for edge in (ya, yb):
                    quadsY(ext, mir(A(RO, SILL_DEG, HEAD_DEG), sg), mir(A(RI, SILL_DEG, HEAD_DEG), sg), edge, 'interior_panel')
                S(ext, mir(A(RO + 0.002, SILL_DEG - 2.5, SILL_DEG, step=2.5), sg), ya - 0.04, yb + 0.04, 'glass_black')       # black surround
                S(ext, mir(A(RO + 0.002, HEAD_DEG, HEAD_DEG + 2.5, step=2.5), sg), ya - 0.04, yb + 0.04, 'glass_black')
                for e2, o2 in ((ya - 0.04, ya), (yb, yb + 0.04)):
                    S(ext, mir(A(RO + 0.002, SILL_DEG, HEAD_DEG), sg), e2, o2, 'glass_black')
                S(sal, mir(A(RI - 0.004, HEAD_DEG - 7.5, HEAD_DEG - 7.5), sg) + mir(A(RI - 0.004, HEAD_DEG - 7.5, HEAD_DEG - 7.5), sg), ya, yb, 'led_warm') if False else None
                S(sal, mir(A(RI - 0.004, HEAD_DEG + 1, HEAD_DEG + 4, step=3), sg), ya + 0.05, yb - 0.05, 'panel_ceiling', toward=AX)   # vent grille
                S(sal, mir(A(RI - 0.004, HEAD_DEG - 6, HEAD_DEG - 3, step=3), sg), ya + 0.05, yb - 0.05, 'led_warm', toward=AX)         # LED strip along the window head
        for d in DOORS:
            ya, yb = d - DOOR_W / 2, d + DOOR_W / 2
            S(ext, mir([(1.05, 0.5), (1.10, 0.55), (RO, 0.62), (RO, 0.70)], sg), ya, yb, 'skirt_black', away=AX)
            od = mir([(RO, 0.70), (RO, CZ)] + A(RO, 0, HEAD_DEG), sg); idd = mir([(RI, FLOOR), (RI, CZ)] + A(RI, 0, HEAD_DEG), sg)
            for edge in (ya, yb): quadsY(ext, od, idd, edge, 'interior_panel')                                        # door jambs
            S(ext, mir([A(RO, HEAD_DEG, HEAD_DEG)[0], A(RI, HEAD_DEG, HEAD_DEG)[0]], sg), ya, yb, 'subway_orange')
            ext.box(P(sg * (RO - 0.09), d, 0.695), (0.2, DOOR_W, 0.012), 'steel_dark')                                 # threshold wedge
            ext.box(P(sg * (RO - 0.02), d, 0.70), (0.04, DOOR_W, 0.012), 'sign_yellow')
            sal.box(P(sg * (RI - 0.4), d, FLOOR + 0.004), (0.8, DOOR_W, 0.008), 'floor_light')                          # light threshold band
            for off in (DOOR_W / 2, -DOOR_W / 2 - 0.45):        # orange door-zone bands on the outer skin (overlay), roof included
                S(ext, mir([(RO + 0.0025, SKIRT_Z), (RO + 0.0025, CZ)] + A(RO + 0.0025, 0, 90, step=7.5), sg), d + off if off > 0 else d + off, (d + off + 0.45), 'subway_orange', away=AX)
            ext.box(P(sg * (RI - 0.05), d + DOOR_W / 2 + 0.12, 1.2), (0.05, 0.1, 0.1), 'sos_green')
    # ---- floor, underframe
    sal.box(P(0, (-HALF + CAB_Y) / 2, FLOOR - 0.02), (2 * RI, CAB_Y + HALF, 0.04), 'floor_dark')
    ext.box(P(0, -0.0, 0.5 + 0.02), (2.0, L - 0.3, 0.04), 'skirt_black')
    sal.box(P(0, (-HALF + CAB_Y) / 2, FLOOR - 0.05), (2 * RI - 0.02, CAB_Y + HALF, 0.02), 'steel_dark')
    for yy in (-HALF * 0.4, 0.0, HALF * 0.4):
        ext.box(P(0.0, yy, 0.55), (1.3, min(1.0, HALF * 0.2), 0.12), 'steel_dark')
    # ---- roof (outer) and ceiling (inner): closed, explicit normals.  Roof panel strip along the crown.
    S(ext, ROOF_OUT, -HALF, ROOFEND, 'livery_white', away=AX)
    S(sal, CEIL, -HALF, CAB_Y, 'interior_ceiling', toward=AX)
    ext.box(P(0, (ROOFEND - HALF) / 2, 2.644), (0.5, ROOFEND + HALF - 0.4, 0.006), 'panel_ceiling')
    # ---- end walls with an ARCHED gangway aperture (1.3 m wide), bellows, turn-plate
    ap = [(0.65, FLOOR), (0.65, 1.45)] + [(0.65 * math.cos(math.radians(a)), 1.45 + 0.65 * math.sin(math.radians(a))) for a in range(15, 181, 15)] + [(-0.65, FLOOR)]
    for e in ((-1,) if has_cab else (-1, 1)):
        bm = ext.bm
        yy = yc + s * e * (HALF - 0.03)
        ov = [bm.verts.new((x, yy, z)) for x, z in SECTION]
        ed = [bm.edges.new((ov[i], ov[(i + 1) % len(ov)])) for i in range(len(ov))]
        hv = [bm.verts.new((x, yy, z)) for x, z in ap]
        ed += [bm.edges.new((hv[i], hv[(i + 1) % len(hv)])) for i in range(len(hv))]
        import bmesh as bm_
        res = bm_.ops.triangle_fill(bm, use_beauty=True, edges=ed)
        for f in res['geom']:
            if isinstance(f, bm_.types.BMFace):
                f.material_index = ext._mi('livery_white'); f[ext.fx] = 1
                if f.normal.y * s * e < 0: f.normal_flip()
        ya, yb = ysort(e * (HALF - 0.03), e * (HALF + GAP / 2 + 0.01))
        ext.strip_y(ap + [ap[0]], ya, yb, 'rubber_black', closed=False)
        ya, yb = ysort(e * (HALF - 0.1), e * (HALF + GAP / 2 + 0.05))
        sal.bbox((-0.65, ya, FLOOR - 0.03), (0.65, yb, FLOOR + 0.005), 'steel_bright')
        for sgx in (-1, 1):
            sal.cyl(P(sgx * 0.70, e * (HALF - 0.12), (FLOOR + 2.0) / 2), 0.019, 2.0 - FLOOR - 0.1, CFG['pole_mat'], seg=8)
        sal.box(P(0.55, e * (HALF - 0.1), 1.45), (0.2, 0.04, 0.1), 'sos_green')
        sal.sphere(P(0.7, e * (HALF - 0.5), 2.36), 0.05, 'plastic_grey', sz=0.6, seg=8)
        sal.sphere(P(-0.7, e * (HALF - 0.5), 2.36), 0.05, 'plastic_grey', sz=0.6, seg=8)
    # ---- cab partition
    if has_cab:
        for sgx in (-1, 1):
            sal.box(P(sgx * 0.80, CAB_Y, (FLOOR + 1.4) / 2), (0.6, 0.05, 1.4 - FLOOR), 'interior_panel')
            gls.box(P(sgx * 0.80, CAB_Y, 1.65), (0.5, 0.02, 0.5), 'glass_clear')
        sal.box(P(0, CAB_Y, (FLOOR + 1.0) / 2), (0.9, 0.05, 1.0 - FLOOR), 'interior_panel')
        gls.box(P(0, CAB_Y, 1.55), (0.9, 0.02, 0.6), 'glass_clear')
        sal.box(P(0, CAB_Y, 2.25), (1.0, 0.05, 0.1), 'interior_panel')
    # ---- seating
    be = [-HALF + 0.55]
    for d in DOORS: be += [d - DOOR_W / 2 - 0.05, d + DOOR_W / 2 + 0.05]
    be.append(CAB_Y - (0.2 if has_cab else 0.55))
    bays = [(be[i], be[i + 1]) for i in range(0, len(be), 2)]
    benches = []
    for bi, (a, b) in enumerate(bays):
        wc = has_cab and bi == len(bays) - 1
        bb = b - (1.1 if wc else 0.0)
        build_bay(sal, P, a, bb, CFG, end_a=(bi > 0), end_b=(not wc and bi < len(bays) - 1))
        if bb - a > 0.6: benches.append((yc + s * a, yc + s * bb))
        if wc:
            for sg in (-1, 1):
                for k in (0, 1):
                    yy = b - 0.3 - k * 0.45
                    sal.box(P(sg * (RI - 0.06), yy, FLOOR + 0.75), (0.05, 0.4, 0.40), 'plastic_dark')
                    sal.box(P(sg * (RI - 0.09), yy, FLOOR + 0.75), (0.03, 0.36, 0.36), 'seat_moquette')
            sal.box(P(RI - 0.04, b - 0.7, 1.55), (0.02, 0.3, 0.3), 'sign_blue')
    # ---- orange poles at x=+-0.58, curved tops to the overhead rails at x=+-0.45
    pole_ys = []
    for d in DOORS:
        pole_ys += [d - DOOR_W / 2 - 0.1, d + DOOR_W / 2 + 0.1]
    for yy in pole_ys:
        for sgx in (-1, 1):
            sal.cyl_between(P(sgx * 0.58, yy, FLOOR), P(sgx * 0.58, yy, 1.95), 0.019, CFG['pole_mat'], seg=8)
            sal.cyl_between(P(sgx * 0.58, yy, 1.95), P(sgx * 0.45, yy, 2.37), 0.019, CFG['pole_mat'], seg=8)
    for sgx in (-1, 1):
        sal.cyl(P(sgx * 0.45, (-HALF + CAB_Y) / 2, 2.38), 0.016, CAB_Y + HALF - 0.4, CFG['pole_mat'], axis='y', seg=8)
    # ---- lighting + route diagrams (on the lining above the door headers)
    nl = max(2, int((CAB_Y + HALF - 0.8) // 2.0))
    for k in range(nl):
        yy = -HALF + 1.0 + k * ((CAB_Y + HALF - 2.0) / max(1, nl - 1))
        for sx in (-0.15, 0.15):
            sal.box(P(sx, yy, 2.555), (0.05, 1.3, 0.01), 'strip_light')
        lights.append(yc + s * yy)
    for sg in (-1, 1):
        for d in DOORS:
            arc_panel_uv(sal, sg, RI - 0.006, 52, 64, d - 0.65, d + 0.65, 'route_map_panel')
    # ---- exterior: side roundels
    for sg in (-1, 1):
        for yy in (-HALF + 1.0, CAB_Y - 0.95):
            xo = sg * (RO + 0.003)
            q = ext.quad_uv(P(xo, yy - 0.2, 0.92), P(xo, yy + 0.2, 0.92), P(xo, yy + 0.2, 1.32), P(xo, yy - 0.2, 1.32), 'sign_roundel')
            q[ext.fx] = 1
            if q.normal.x * sg < 0: q.normal_flip()
    # ---- DOUBLE doors: each opening has two bi-parting curved leaves (a = nose side, b = rear side), each 0.64 m wide, own animatable node
    nodes = {}
    LW = 0.645; h = LW / 2
    for sgx, nm in ((-1, 'L'), (1, 'R')):
        for di, d in enumerate(DOORS):
            wyc = yc + s * d
            for half, off in (('a', +0.3225), ('b', -0.3225)):
                wy = wyc + off
                lm = M(); Ro, Rn = 1.135, 1.095
                ax_ = (-sgx * 1.12, CZ)
                def pl(pts, y0, y1, mat, **kw):
                    lm.strip_y([(sgx * x - sgx * 1.12, z) for x, z in pts], y0, y1, mat, **kw)
                low = [(Ro, 0.70), (Ro, CZ)] + A(Ro, 0, SILL_DEG); lowi = [(Rn, 0.70), (Rn, CZ)] + A(Rn, 0, SILL_DEG)
                pl(low, -h, h, 'subway_orange', away=ax_); pl(lowi, -h, h, 'interior_panel', toward=ax_)
                # window zone: frame stiles (outer edge 0.07, meeting edge 0.09), top/bottom rails and the glass pane
                pl(A(Ro, SILL_DEG, HEAD_DEG), -h, -h + 0.08, 'subway_orange', away=ax_); pl(A(Ro, SILL_DEG, HEAD_DEG), h - 0.08, h, 'subway_orange', away=ax_)
                pl(A(Rn, SILL_DEG, HEAD_DEG), -h, -h + 0.08, 'interior_panel', toward=ax_); pl(A(Rn, SILL_DEG, HEAD_DEG), h - 0.08, h, 'interior_panel', toward=ax_)
                pl(A(Ro, HEAD_DEG - 3, HEAD_DEG, step=3), -h, h, 'subway_orange', away=ax_)
                pl(A(Rn, HEAD_DEG - 3, HEAD_DEG, step=3), -h, h, 'interior_panel', toward=ax_)
                pl(A(Ro, SILL_DEG, SILL_DEG + 3, step=3), -h + 0.08, h - 0.08, 'subway_orange', away=ax_)
                pl(A(1.115, SILL_DEG + 3, HEAD_DEG - 3), -h + 0.08, h - 0.08, 'glass_window', toward=ax_)       # GLASS in each leaf
                for yy in (-h, h):
                    lm.strip_y([(sgx * Ro - sgx * 1.12, 0.72), (sgx * Ro - sgx * 1.12, 1.45)], yy - 0.004, yy + 0.004, 'rubber_black')
                o = lm.to_obj('tmp', parent=None, loc=(sgx * 1.12, wy, 0.0))
                nodes.setdefault(nm, []).append((wyc, half, o))
    if has_cab:
        build_cab(idx, yc, s, car, ext, cab, gls, P, HALF, CAB_Y, ysort)
    ext.to_obj(f'car_{idx}_exterior', parent=car)
    sal.to_obj(f'car_{idx}_saloon', parent=car)
    gls.to_obj(f'car_{idx}_glass', parent=car)
    if has_cab: cab.to_obj(f'car_{idx}_cab', parent=car)
    nodes['_lights'] = lights; nodes['_benches'] = benches; nodes['_doors'] = [yc + s * d for d in DOORS]
    return nodes

def build_bay(sal, P, a, b, cfg, end_a=False, end_b=False):
    """Longitudinal benches (seat front at x=+-0.62; cushion 0.43 above floor, back top 0.90 above floor)."""
    L = b - a
    if L < 0.6: return
    n = max(1, int(L / 0.50)); sw = L / n
    for sg in (-1, 1):
        xc = sg * (0.62 + 0.23)
        for i in range(n):
            ym = a + sw * (i + 0.5)
            sal.box(P(xc, ym, FLOOR + 0.415), (0.46, sw - 0.015, 0.06), cfg['seat_mat'])                                          # cushion top y=1.14
            sal.box(P(sg * (RI - 0.035), ym, FLOOR + 0.66), (0.07, sw - 0.015, 0.50), cfg['seat_mat'], rot=(0, sg * 0.14, 0))      # back to y~1.60
        sal.box(P(xc, (a + b) / 2, FLOOR + 0.19), (0.44, L - 0.02, 0.38), 'interior_panel')                                      # plinth
        sal.box(P(sg * 0.625, (a + b) / 2, FLOOR + 0.19), (0.012, L - 0.02, 0.36), 'plastic_dark')                               # dark front panel
        for yy, flag in ((a, end_a), (b, end_b)):
            sal.box(P(sg * 0.85, yy, FLOOR + 0.5), (0.46, 0.04, 1.0), 'plastic_dark')                                            # moulded end panel
            if flag:
                sal.box(P(sg * 0.85, yy + (0.03 if yy == a else -0.03), FLOOR + 1.1), (0.34, 0.012, 0.35), 'glass_clear')        # perspex screen

def hp_x(z):
    """Half-width of the OUTER body at height z (for z between 0.62 and 2.642)."""
    if z <= CZ: return RO
    return math.sqrt(max(0.0, RO * RO - (z - CZ) ** 2))

def build_cab(idx, yc, s, car, ext, cab, gls, P, HALF, CAB_Y, ysort):
    def Y(t): return HALF - t
    NOSE_Y = Y(0.03)
    AX = (0.0, CZ)
    cab.box(P(0, (CAB_Y + NOSE_Y) / 2, FLOOR - 0.02), (2 * RI, NOSE_Y - CAB_Y, 0.04), 'floor_dark')
    # solid side walls in the cab zone, curved door opening (hinged)
    t0, t1 = 0.90, 1.70                      # cab door opening, distance behind the nose
    for sg in (-1, 1):
        for (ta, tb) in ((0.80, t0), (t1, CAB_LEN)):
            a, b = Y(tb), Y(ta)
            y0, y1 = ysort(a, b)
            ext.strip_y(mir([(1.05, 0.5), (1.10, 0.55), (RO, 0.62), (RO, SKIRT_Z)], sg), y0, y1, 'skirt_black', away=AX)
            ext.strip_y(mir([(RO, SKIRT_Z), (RO, CZ)] + A(RO, 0, HEAD_DEG), sg), y0, y1, 'livery_white', away=AX)
            cab.strip_y(mir([(RI, FLOOR), (RI, CZ)] + A(RI, 0, HEAD_DEG), sg), y0, y1, 'interior_panel', toward=AX)
        # door opening reveals and sill
        y0, y1 = ysort(Y(t1), Y(t0))
        ext.strip_y(mir([(1.05, 0.5), (1.10, 0.55), (RO, 0.62), (RO, 0.70)], sg), y0, y1, 'skirt_black', away=AX)
        ext.strip_y(mir([A(RO, HEAD_DEG, HEAD_DEG)[0], A(RI, HEAD_DEG, HEAD_DEG)[0]], sg), y0, y1, 'interior_panel')
        # cab door: curved slab hinged at the front edge (t=t0)
        dm = M(); dw = t1 - t0
        Ro, Rn = 1.135, 1.095
        hx = sg * 1.12
        def pl(pts, ya_, yb_, mat, **kw):
            dm.strip_y([(sg * x - hx, z) for x, z in pts], ya_, yb_, mat, **kw)
        axl = (-hx, CZ)
        # local y: hinge at 0, door extends rearwards (car-local -y direction) by dw ; mirror for s
        ya_, yb_ = (-dw, 0.0) if s > 0 else (0.0, dw)
        low = [(Ro, 0.70), (Ro, CZ)] + A(Ro, 0, SILL_DEG); lowi = [(Rn, 0.70), (Rn, CZ)] + A(Rn, 0, SILL_DEG)
        pl(low, ya_, yb_, 'subway_orange', away=axl); pl(lowi, ya_, yb_, 'interior_panel', toward=axl)
        pl(A(Ro, SILL_DEG, HEAD_DEG), ya_, yb_, 'subway_orange', away=axl) if False else None
        for (u0, u1) in ((ya_, ya_ + 0.1), (yb_ - 0.1, yb_)):
            pl(A(Ro, SILL_DEG, HEAD_DEG), u0, u1, 'subway_orange', away=axl); pl(A(Rn, SILL_DEG, HEAD_DEG), u0, u1, 'interior_panel', toward=axl)
        pl(A(Ro, HEAD_DEG - 3, HEAD_DEG, step=3), ya_, yb_, 'subway_orange', away=axl)
        pl(A(1.115, SILL_DEG + 3, HEAD_DEG - 3), ya_ + 0.1, yb_ - 0.1, 'glass_window', toward=axl)
        nm = 'L' if (sg * s) < 0 else 'R'
        suffix = '' if s > 0 else '_rear'
        hinge = empty(f'cab_door_{nm}{suffix}', loc=(sg * 1.12, P(0, Y(t0), 0)[1], 0.0), parent=car, kind='ARROWS', size=0.2)
        dm.to_obj(f'cab_door_{nm}{suffix}_mesh', parent=hinge, loc=(0, 0, 0))
    # ---- nose: loft of the body section from t=0.80 (full) to the nose face at t=0.03
    rings = [(0.80, 1.0, 1.0), (0.50, 0.95, 0.985), (0.25, 0.88, 0.96), (0.03, 0.78, 0.92)]
    Z0 = 0.5
    base = [(RO, 0.62)] + OUT_FULL + [(-RO, 0.62)]
    ringpts = []
    for t, sx, sz in rings:
        ringpts.append([(x * sx, Z0 + (z - Z0) * sz) for x, z in base])
    bmx = ext.bm; fs = []
    vr = [[bmx.verts.new(P(x, Y(t), z)) for x, z in rp] for (t, _, _), rp in zip(rings, ringpts)]
    n = len(base)
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = bmx.faces.new((vr[r][i], vr[r][j], vr[r + 1][j], vr[r + 1][i])); f[ext.fx] = 1
            cx = (ringpts[r][i][0] + ringpts[r][j][0]) / 2; cz = (ringpts[r][i][1] + ringpts[r][j][1]) / 2
            if f.normal.x * cx + f.normal.z * (cz - 1.4) < 0: f.normal_flip()
            fs.append(f)
    ext._tag(fs, 'livery_white')
    # nose face with THREE glazing bays (driver left / centre evacuation door / right) - per research/drive-realism.md
    sxN, szN = rings[-1][1], rings[-1][2]
    def zs(zo): return Z0 + (zo - Z0) * szN
    def hw(zo): return sxN * hp_x(zo) - 0.07
    import bmesh as bm_
    ov = [bmx.verts.new(P(x * sxN, Y(0.03), Z0 + (z - Z0) * szN)) for x, z in base]
    ed = [bmx.edges.new((ov[i], ov[(i + 1) % len(ov)])) for i in range(len(ov))]
    GZ0, GZ1 = 1.30, 2.18            # glazing from just above the black lower panel to near the roof line (bigger windscreen)
    PIL_ = 0.045                      # half-width of the white pillars between the bays
    bays = [(-1.0, -0.30 - PIL_), (-0.30 + PIL_, 0.30 - PIL_), (0.30 + PIL_, 1.0)]     # x extents (outer limits clipped to hw(z))
    def bay_poly(xa, xb):
        pa0 = max(xa, -hw(GZ0)); pb0 = min(xb, hw(GZ0)); pa1 = max(xa, -hw(GZ1)); pb1 = min(xb, hw(GZ1))
        return [(pa0, zs(GZ0)), (pb0, zs(GZ0)), (pb1, zs(GZ1)), (pa1, zs(GZ1))]
    bay_polys = [bay_poly(xa, xb) for xa, xb in bays]
    for bp in bay_polys:
        hv = [bmx.verts.new(P(x, Y(0.03), z)) for x, z in bp]
        ed += [bmx.edges.new((hv[i], hv[(i + 1) % 4])) for i in range(4)]
    res = bm_.ops.triangle_fill(bmx, use_beauty=True, edges=ed)
    for f in res['geom']:
        if isinstance(f, bm_.types.BMFace):
            f.material_index = ext._mi('livery_white'); f[ext.fx] = 1
            if f.normal.y * s < 0: f.normal_flip()
    # transparent glass in each bay + thin black frames; opaque black lower nose panel with the roundel
    for bp in bay_polys:
        f = gls.quad(*[P(x, NOSE_Y + 0.002, z) for x, z in bp], 'glass_window'); f[gls.fx] = 1
        if f.normal.y * s < 0: f.normal_flip()
        xs_ = [x for x, _ in bp]
        for (xa_, za_), (xb_, zb_) in zip(bp, bp[1:] + bp[:1]):
            ext.cyl_between(P(xa_, NOSE_Y + 0.006, za_), P(xb_, NOSE_Y + 0.006, zb_), 0.012, 'glass_black', seg=4)
    def panel(z0o, z1o, mat, dy=0.006, nstep=4):
        zl = [z0o + (z1o - z0o) * i / nstep for i in range(nstep + 1)]
        for i in range(nstep):
            a_, b_ = zl[i], zl[i + 1]
            f = ext.quad(P(-hw(a_), NOSE_Y + dy, zs(a_)), P(hw(a_), NOSE_Y + dy, zs(a_)), P(hw(b_), NOSE_Y + dy, zs(b_)), P(-hw(b_), NOSE_Y + dy, zs(b_)), mat)
            f[ext.fx] = 1
            if f.normal.y * s < 0: f.normal_flip()
    panel(0.72, GZ0, 'glass_black')
    # centre evacuation door handle strip + hinge line
    ext.box(P(0.20, NOSE_Y + 0.008, zs(1.0)), (0.02, 0.008, 0.18), 'steel_bright')
    # amber LED destination display above the glazing: separate node, UV 0..1 (runtime canvas)
    dsz0, dsz1 = zs(GZ1) + 0.035, zs(GZ1) + 0.17
    dsm = M()
    wd = hw(GZ1 + 0.1) * 0.9
    f = dsm.quad(P(-wd, NOSE_Y + 0.008, dsz0), P(wd, NOSE_Y + 0.008, dsz0), P(wd, NOSE_Y + 0.008, dsz1), P(-wd, NOSE_Y + 0.008, dsz1), 'dest_amber')
    uvl = dsm.bm.loops.layers.uv.verify()
    ls = list(f.loops)
    for l, uv in zip(ls, ((1, 0), (0, 0), (0, 1), (1, 1))): l[uvl].uv = uv
    f[dsm.cuv] = 1; f[dsm.fx] = 1
    if f.normal.y * s < 0: f.normal_flip()
    dsm.to_obj('cab_dest' if s > 0 else 'cab_dest_rear', parent=car, uv=False)
    front = s > 0
    lm = 'headlight' if front else 'taillight'
    for sg in (-1, 1):
        ext.box(P(sg * 0.86, NOSE_Y + 0.010, zs(1.0)), (0.03, 0.012, 0.55), lm)
        for r in range(4):
            for c in range(2):
                ext.cyl(P(sg * (0.80 + c * 0.04), NOSE_Y + 0.010, zs(0.76 + r * 0.04)), 0.011, 0.012, lm, axis='y', seg=8)
    nm = 'headlight' if front else 'taillight'
    empty(f'{nm}_L', loc=P(-0.86 * (1 if s > 0 else -1), NOSE_Y + 0.05, zs(1.0)), parent=car)
    empty(f'{nm}_R', loc=P(0.86 * (1 if s > 0 else -1), NOSE_Y + 0.05, zs(1.0)), parent=car)
    q = ext.quad_uv(P(-0.17, NOSE_Y + 0.012, zs(0.74)), P(0.17, NOSE_Y + 0.012, zs(0.74)), P(0.17, NOSE_Y + 0.012, zs(1.12)), P(-0.17, NOSE_Y + 0.012, zs(1.12)), 'sign_roundel')
    q[ext.fx] = 1
    if q.normal.y * s < 0: q.normal_flip()
    ext.box(P(0, NOSE_Y + 0.08, 0.56), (0.3, 0.26, 0.16), 'steel_dark')
    ext.box(P(0, NOSE_Y - 0.0, 0.52), (1.4, 0.1, 0.1), 'steel_dark')
    # ---- cab interior (compact): ceiling, desk (just behind the glass), controls, seat; driver LEFT of the centre door, eyes ~1.0 m back
    cab.strip_y(CEIL, *ysort(CAB_Y, Y(0.45)), 'interior_ceiling', toward=AX)
    DZ = FLOOR + 0.80                                    # desk top 0.80 m above the floor
    DX = -0.42 * s                                        # driver offset (rear cab: mirrored)
    cab.box(P(0, Y(0.52), (FLOOR + DZ) / 2), (1.76, 0.40, DZ - FLOOR), 'plastic_black')            # desk body hard against the nose
    cab.poly([P(-0.88, Y(0.74), DZ + 0.0), P(0.88, Y(0.74), DZ + 0.0), P(0.88, Y(0.32), DZ - 0.05), P(-0.88, Y(0.32), DZ - 0.05)], 'plastic_grey')
    cab.box(P(0, Y(0.33), DZ + 0.02), (1.76, 0.05, 0.05), 'plastic_black')                          # dash lip under the glass
    mc = DX - 0.28; br = DX - 0.05
    cab.cyl(P(mc, Y(0.60), DZ + 0.03), 0.065, 0.06, 'steel_dark', seg=14)                          # master controller
    cab.cyl(P(mc, Y(0.60), DZ + 0.11), 0.015, 0.14, 'steel_bright', seg=8)
    cab.box(P(mc, Y(0.63), DZ + 0.19), (0.04, 0.11, 0.04), 'plastic_black')
    cab.cyl(P(br, Y(0.60), DZ + 0.03), 0.055, 0.06, 'steel_dark', seg=14)                          # brake handle
    cab.cyl(P(br, Y(0.60), DZ + 0.10), 0.013, 0.12, 'steel_bright', seg=8)
    cab.box(P(br, Y(0.60), DZ + 0.17), (0.10, 0.03, 0.03), 'button_red')
    for dxx, mm in ((0.20, 'button_green'), (0.29, 'button_green'), (0.38, 'button_red'), (0.47, 'button_amber')):
        cab.cyl(P(DX + dxx + 0.35, Y(0.56), DZ - 0.03), 0.022, 0.02, mm, seg=12)
    cab.cyl(P(0.72, Y(0.56), DZ - 0.02), 0.035, 0.05, 'button_red', seg=14)
    cab.box(P(0, Y(1.2), 2.12), (0.0001, 0.0001, 0.0001), 'plastic_black') if False else None
    # driver's seat: cushion centre t=0.98, back t=1.18 (eyes ~1.0 m behind the glass)
    cab.cyl(P(DX, Y(0.98), FLOOR + 0.2), 0.05, 0.3, 'steel_dark', seg=8)
    cab.box(P(DX, Y(0.98), FLOOR + 0.42), (0.44, 0.44, 0.08), 'plastic_dark')
    cab.box(P(DX, Y(1.18), FLOOR + 0.76), (0.42, 0.08, 0.52), 'plastic_dark')
    cab.box(P(DX, Y(1.20), FLOOR + 1.08), (0.28, 0.07, 0.2), 'plastic_dark')
    for sxs in (-0.24, 0.24): cab.box(P(DX + sxs, Y(0.98), FLOOR + 0.55), (0.04, 0.34, 0.04), 'steel_dark')   # armrests
    cab.box(P(0, Y(0.9), 2.5), (0.2, 0.6, 0.01), 'strip_light')
    sfx = '' if idx == 0 else '_rear'
    def screen(name, c_t, c_x, c_z, w, h, tilt):
        sm = M(); hw_, hh = w / 2, h / 2
        dz = hh * math.cos(tilt); dy = hh * math.sin(tilt)
        pts = [(-hw_, -dy, -dz), (hw_, -dy, -dz), (hw_, dy, dz), (-hw_, dy, dz)]
        f = sm.quad(*[P(c_x + px, Y(c_t) + py, c_z + pz) for px, py, pz in pts], 'screen_blank')
        uvl = sm.bm.loops.layers.uv.verify()
        for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv
        f[sm.cuv] = 1; f[sm.fx] = 1
        return sm.to_obj(name, parent=car, uv=False)
    screen(f'cab_screen{sfx}', 0.56, DX + 0.10, DZ + 0.14, 0.34, 0.20, math.radians(55))
    screen(f'cab_speedo{sfx}', 0.58, DX + 0.40, DZ + 0.12, 0.17, 0.11, math.radians(55))
    empty('cab_eye' if s > 0 else 'cab_eye_rear', loc=P(DX, Y(1.0), FLOOR + 1.15), parent=car, kind='SPHERE', size=0.08)
    empty('cab_light' if s > 0 else 'cab_light_rear', loc=P(0, Y(0.9), 2.46), parent=car)

def layout():
    total = sum(CAR_LENS) + GAP * (len(CAR_LENS) - 1)
    out = []; y = total / 2
    for i, L in enumerate(CAR_LENS):
        out.append((y - L / 2, L, +1 if i < 2 else -1, DOORS_END if i in (0, 3) else DOORS_MID, i in (0, 3)))
        y -= L + GAP
    return total, out

def build_bogies(root, total):
    """6 small bogies at the research centres (from the front): 2.6, 10.3, 15.8, 23.4, 28.9, 36.6 m scaled to the set length."""
    for k, c in enumerate((2.6, 10.3, 15.8, 23.4, 28.9, 36.6)):
        yb = total / 2 - c * total / 39.25
        bg = M()
        for sx in (-1, 1):
            bg.box((sx * 0.80, 0, 0.40), (0.1, 1.9, 0.18), 'steel_dark')
        bg.box((0, 0, 0.47), (1.7, 0.22, 0.12), 'steel_dark')
        for ay in (-0.825, 0.825):
            bg.cyl((0, ay, 0.26), 0.04, 1.5, 'steel_bright', axis='x', seg=8)
            for sx in (-1, 1):
                bg.cyl((sx * 0.55, ay, 0.26), 0.26, 0.11, 'steel_bright', axis='x', seg=24)
                bg.cyl((sx * 0.50, ay, 0.26), 0.29, 0.03, 'steel_dark', axis='x', seg=24)
            bg.box((0, ay, 0.34), (0.5, 0.35, 0.24), 'steel_dark')
        for sx in (-1, 1):
            bg.box((sx * 0.92, 0.5, 0.15), (0.14, 0.35, 0.05), 'conductor_rail')
            bg.box((sx * 0.92, 0.5, 0.28), (0.04, 0.06, 0.26), 'steel_dark')
        bg.to_obj(f'bogie_{k}', parent=root, loc=(0, yb, 0))

def build_train():
    reset()
    root = group('train')
    total, cars = layout()
    nodes = []; lights = []
    for i, (yc, L, s, doors, cab) in enumerate(cars):
        n = build_car(i, yc, s, root, L, doors, cab); lights += n.pop('_lights'); nodes.append(n)
    door_world = []
    for nm in ('L', 'R'):
        leaves = [t for n in nodes for t in n.get(nm, [])]
        centres = sorted({round(t[0], 4) for t in leaves}, reverse=True)       # front -> rear
        for wyc, half, o in leaves:
            i = centres.index(round(wyc, 4))
            o.name = f'door_{nm}_{i}_{half}'; o.data.name = o.name; o.parent = root
        if nm == 'L': door_world = centres
    build_bogies(root, total)
    nose = cars[0][0] + cars[0][1] / 2 - 0.03
    empty('couple_front', loc=(0, nose + 0.25, 0.56), parent=root, kind='ARROWS', size=0.3)
    empty('couple_rear', loc=(0, -(nose + 0.25), 0.56), parent=root, kind='ARROWS', size=0.3)
    for k, wy in enumerate(sorted(lights, reverse=True)):
        empty(f'interior_light_{k}', loc=(0, wy, 2.45), parent=root)
    # ---- walkable-volume data for the simulator
    prof = [[round(x, 3), round(head_room(x), 3)] for x in [0, 0.2, 0.4, 0.58, 0.62, 0.8, 0.95, 1.0, 1.05, 1.085]]
    cars_json = []
    for i, ((yc, L, s, doors, cab), n) in enumerate(zip(cars, nodes)):
        cars_json.append(dict(index=i, centreZ=round(-yc, 3), length=L, hasCab=cab,
                              benchZRanges=[sorted([round(-a, 3), round(-b, 3)]) for a, b in n['_benches']],
                              doorZ=[round(-d, 3) for d in n['_doors']], doorWidth=DOOR_W))
    data = dict(
        note='Train-local coordinates as in train.glb (three.js: nose = -Z, +Y up, x across). Heights are above the FLOOR, y_floor=0.695 above rail head.',
        floorY=FLOOR, bodyWidth=2 * RO, interiorHalfWidthAtFloor=RI, ceilingApexY=round(CZ + RI, 3), roofApexY=round(CZ + RO, 3),
        aisleHalfWidth=0.62, aisleNote='benches occupy |x| in [0.62, 1.085] along benchZRanges; between benches (door vestibules, gangways) the walkable half-width is 0.62 m with poles at |x|=0.58 near doors, 1.085 m clear in door vestibules only below y=floor+1.4',
        headroomVsX=prof, headroomFormula='h(x) = 1.487 + sqrt(1.085^2 - x^2) - 0.695 for |x|<=1.085  (ceiling y minus floor)',
        minStandingHeadroom=1.75, minStandingNote='an adult of 1.75 m can only stand where headroomVsX >= 1.80 i.e. |x| <= 0.35; head-bump zone otherwise',
        gangway=dict(width=1.3, archApexY=2.10, halfWidth=0.65),
        cab=dict(eyeFront=[-0.42, 1.845, round(-(total / 2 - 1.0), 3)], eyeRear=[0.42, 1.845, round(total / 2 - 1.0, 3)], eyeToGlassM=1.0, deskTopY=round(FLOOR + 0.80, 3), deskFrontToGlassM=0.30, driverSide='left of centre door (x=-0.42 front cab, +0.42 rear cab)', partitionDistanceFromNoseM=1.8, glazing='three bays (driver / centre evacuation door / right), glass y from 1.30 to 2.18, black frame, amber LED destination display node cab_dest'),
        doors=dict(type='double bi-parting', nodes='door_{L|R}_{n}_{a|b}, n=0..5 front->rear', centreZ=sorted(round(zz, 3) for c in cars_json for zz in c['doorZ']), openingWidth=DOOR_W, leafWidth=0.645, travelM=0.6,
                   a='nose-side leaf: open = translate -Z by 0.6 m (toward the nose)', b='rear-side leaf: open = translate +Z by 0.6 m (toward the rear)', leafNodeOrigin='leaf centre: x=+-1.12, y=0, z=door centre +-0.3225 (a: -0.3225 in three z, b: +0.3225)'),
        cars=cars_json)
    json.dump(data, open(os.path.join(OUT, 'train_walkable.json'), 'w'), indent=1)
    return root

def build_lod():
    reset()
    root = group('train')
    total, cars = layout()
    prof = [(1.05, 0.5), (RO, 0.62)] + OUT_FULL[1:-1][:0] + [(x, z) for x, z in OUT_FULL] + [(-RO, 0.62), (-1.05, 0.5)]
    for idx, (yc, L, sg, doors, cab) in enumerate(cars):
        HALF_ = L / 2
        car = group(f'car_{idx}', parent=root)
        m = M()
        if cab:
            a, b = (yc - HALF_, yc + HALF_ - 0.5) if sg > 0 else (yc - HALF_ + 0.5, yc + HALF_)
            m.prism_y(prof, a, b, 'livery_white')
            sc = [(x * 0.88, 0.5 + (z - 0.5) * 0.95) for x, z in prof]
            if sg > 0: m.prism_y(sc, yc + HALF_ - 0.5, yc + HALF_, 'livery_white')
            else: m.prism_y(sc, yc - HALF_, yc - HALF_ + 0.5, 'livery_white')
            m.box((0, yc + sg * (HALF_ - 0.0), 1.4), (1.5, 0.02, 1.3), 'glass_black')
        else:
            m.prism_y(prof, yc - HALF_, yc + HALF_, 'livery_white')
        for sx in (-1, 1):
            m.box((sx * 1.05, yc, 1.95), (0.02, L - 1.2, 0.5), 'glass_black', rot=(0, sx * math.radians(-30), 0))
            for d in doors:
                m.box((sx * 1.16, yc + sg * d, 1.2), (0.01, 1.3, 1.1), 'subway_orange')
        m.box((0, yc, 0.58), (2.3, L - 0.2, 0.3), 'skirt_black')
        m.to_obj(f'car_{idx}_body', parent=car)
    bm_ = M()
    for k, c in enumerate((2.6, 10.3, 15.8, 23.4, 28.9, 36.6)):
        bm_.box((0, total / 2 - c * total / 39.25, 0.28), (1.5, 1.6, 0.5), 'steel_dark')
    bm_.to_obj('bogies', parent=root)
    nose = cars[0][0] + cars[0][1] / 2 - 0.03
    empty('couple_front', loc=(0, nose + 0.25, 0.56), parent=root); empty('couple_rear', loc=(0, -(nose + 0.25), 0.56), parent=root)
    empty('headlight_L', loc=(-0.62, nose + 0.05, 1.3), parent=root); empty('headlight_R', loc=(0.62, nose + 0.05, 1.3), parent=root)
    return root

if __name__ == '__main__':
    build_train(); export('train.glb')
    build_lod(); export('train_lod.glb')

"""Hand-modelled landmark touches. Geometry is generated procedurally and then built as Blender meshes by city_build.py.
Slots (material index): 0 stone, 1 roof, 2 metal, 3 glass, 4 steel."""
import math
import numpy as np
from shapely.geometry import Polygon, Point, box
from shapely.geometry.polygon import orient
from city_lib import *

SL = ["lm_stone", "lm_roof", "lm_metal", "lm_glass", "lm_steel"]
STONE, ROOF, METAL, GLASS, STEEL = range(5)

def prism(B, ring, zb, zt, col, mat=STONE, cap=True, capcol=None):
    ring = list(orient(Polygon(ring), 1.0).exterior.coords)[:-1]; n = len(ring)
    for k in range(n):
        a = ring[k]; b = ring[(k + 1) % n]
        B.add([(a[0], a[1], zb), (b[0], b[1], zb), (b[0], b[1], zt), (a[0], a[1], zt)], [[0, 1, 2], [0, 2, 3]], col, None, mat)
    if cap:
        V, T = earcut_poly(Polygon(ring)); P = np.c_[V, np.full(len(V), zt)]
        B.add(P, flip_up(P, T.astype(np.int64)), capcol if capcol is not None else col, None, mat if capcol is None else ROOF)

def rect(cx, cy, w, d, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]

def box3(B, cx, cy, w, d, zb, zt, col, ang=0.0, mat=STONE, capcol=None):
    prism(B, rect(cx, cy, w, d, ang), zb, zt, col, mat, True, capcol)

def ngon(cx, cy, r, n=16, ry=None, ang=0.0):
    ry = r if ry is None else ry; c, s = math.cos(ang), math.sin(ang)
    return [(cx + r * math.cos(2 * math.pi * k / n) * c - ry * math.sin(2 * math.pi * k / n) * s, cy + r * math.cos(2 * math.pi * k / n) * s + ry * math.sin(2 * math.pi * k / n) * c) for k in range(n)]

def pyramid(B, ring, zb, zt, col, mat=ROOF, apex=None):
    ring = list(orient(Polygon(ring), 1.0).exterior.coords)[:-1]; n = len(ring)
    ax, ay = apex if apex else (sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n)
    for k in range(n):
        a = ring[k]; b = ring[(k + 1) % n]
        B.add([(a[0], a[1], zb), (b[0], b[1], zb), (ax, ay, zt)], [[0, 1, 2]], np.array([col * 0.85, col * 0.85, col * 1.15]), None, mat)

def surf(B, fn, nu, nv, col, mat, closed_u=False, colfn=None):
    us = np.linspace(0, 1, nu + 1); vs = np.linspace(0, 1, nv + 1)
    P = np.array([[fn(u, v) for u in us] for v in vs], np.float32)  # (nv+1, nu+1, 3)
    idx = np.arange((nv + 1) * (nu + 1)).reshape(nv + 1, nu + 1)
    a = idx[:-1, :-1].ravel(); b = idx[:-1, 1:].ravel(); c = idx[1:, 1:].ravel(); d = idx[1:, :-1].ravel()
    T = np.concatenate([np.stack([a, b, c], 1), np.stack([a, c, d], 1)])
    P = P.reshape(-1, 3)
    if colfn is not None: cols = np.array([colfn(p) for p in P], np.float32)
    else: cols = col
    B.add(P, T, cols, None, mat)

def dome(B, cx, cy, zc, rx, ry, rz, col, mat=ROOF, nu=18, nv=6, ang=0.0, rim=0.0):
    c, s = math.cos(ang), math.sin(ang)
    def f(u, v):
        th = 2 * math.pi * u; ph = (math.pi / 2) * v
        x = rx * math.cos(th) * math.cos(ph); y = ry * math.sin(th) * math.cos(ph); z = rz * math.sin(ph)
        return (cx + x * c - y * s, cy + x * s + y * c, zc + z)
    surf(B, f, nu, nv, col, mat, colfn=lambda p: col * (0.8 + 0.4 * min(1, max(0, (p[2] - zc) / max(rz, 1e-3)))))

def vault(B, cx, cy, ang, width, length, zspring, rise, col_glass, col_rib, nribs=None):
    """Barrel vault along local x (length) spanning local y (width)."""
    c, s = math.cos(ang), math.sin(ang)
    def f(u, v):
        x = (u - 0.5) * length; th = math.pi * v
        y = -math.cos(th) * width / 2; z = zspring + rise * math.sin(th)
        return (cx + x * c - y * s, cy + x * s + y * c, z)
    nu = max(2, int(length / 6)); surf(B, f, nu, 10, col_glass, GLASS)
    # underside copy reversed so it is visible from below
    P = []
    nrib = nribs or max(2, int(length / 12))
    for k in range(nrib + 1):
        x = (k / nrib - 0.5) * length
        pts = [(x, -math.cos(math.pi * q / 10) * width / 2, zspring + rise * math.sin(math.pi * q / 10)) for q in range(11)]
        for q in range(10):
            (x0, y0, z0), (x1, y1, z1) = pts[q], pts[q + 1]
            w = 0.5
            B.add([(cx + x0 * c - y0 * s, cy + x0 * s + y0 * c, z0), (cx + x1 * c - y1 * s, cy + x1 * s + y1 * c, z1), (cx + x1 * c - y1 * s, cy + x1 * s + y1 * c, z1 + w), (cx + x0 * c - y0 * s, cy + x0 * s + y0 * c, z0 + w)],
                  [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]], col_rib, None, STEEL)

def beam(B, a, b, w, col, mat=STEEL):
    """Square-section beam between 3D points a,b."""
    a = np.array(a, float); b = np.array(b, float); d = b - a; L = np.linalg.norm(d)
    if L < 1e-6: return
    d /= L; up = np.array([0, 0, 1.0]) if abs(d[2]) < 0.95 else np.array([1.0, 0, 0])
    u = np.cross(d, up); u /= np.linalg.norm(u); v = np.cross(d, u)
    h = w / 2; cs = [(-h, -h), (h, -h), (h, h), (-h, h)]
    pa = [a + u * x + v * y for x, y in cs]; pb = [b + u * x + v * y for x, y in cs]
    for k in range(4):
        k2 = (k + 1) % 4
        B.add([pa[k], pa[k2], pb[k2], pb[k]], [[0, 1, 2], [0, 2, 3]], col, None, mat)
    B.add(pb, [[0, 1, 2], [0, 2, 3]], col, None, mat); B.add(pa, [[0, 2, 1], [0, 3, 2]], col, None, mat)

def gz(TR, x, y): return float(TR.h(x, y, 1))
def gmin(TR, poly):
    pts = list(poly.exterior.coords) + [(poly.centroid.x, poly.centroid.y)]
    return min(gz(TR, x, y) for x, y in pts)

def fp(D, ident):
    for k in ("building", "part"):
        for g, t, i in D[k]:
            if i == ident:
                ps = polys_of(g)
                return max(ps, key=lambda p: p.area) if ps else None
    return None

def mrr(p):
    m = p.minimum_rotated_rectangle; c = list(m.exterior.coords)[:4]
    e0 = (c[1][0] - c[0][0], c[1][1] - c[0][1]); e1 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
    l0 = math.hypot(*e0); l1 = math.hypot(*e1)
    if l0 >= l1: return math.atan2(e0[1], e0[0]), l0, l1, m.centroid.x, m.centroid.y
    return math.atan2(e1[1], e1[0]), l1, l0, m.centroid.x, m.centroid.y

def build(TR, D, log):
    out = []
    sand = lin((0.80, 0.66, 0.45)); red = lin((0.62, 0.30, 0.22)); grey = lin((0.60, 0.58, 0.55)); slate = lin((0.28, 0.30, 0.34))
    silver = lin((0.78, 0.80, 0.83)); steel = lin((0.42, 0.50, 0.58)); glass = lin((0.55, 0.70, 0.80)); copper = lin((0.35, 0.62, 0.52)); darkc = lin((0.25, 0.27, 0.30))
    def L(name, cx, cy):
        B = Buf(); out.append(dict(name=name, cx=cx, cy=cy, B=B, skip=set(), slots=SL)); return B, out[-1]

    # ---- Finnieston Crane
    p = fp(D, "r7279150")
    if p is not None:
        cx, cy = p.centroid.x, p.centroid.y; z0 = gmin(TR, p)
        B, e = L("finnieston_crane", cx, cy); e["skip"].add("r7279150")
        z0 -= 0.3
        box3(B, cx, cy, 20, 20, z0, z0 + 3, grey * 0.8, mat=STONE)
        for sx in (-1, 1):
            for sy in (-1, 1):
                beam(B, (cx + sx * 7, cy + sy * 7, z0 + 3), (cx + sx * 4.5, cy + sy * 4.5, z0 + 44), 1.2, steel)
        for zz in (z0 + 14, z0 + 28, z0 + 43):
            r = 7 - (zz - z0 - 3) / 41 * 2.5
            for k in range(4):
                a = (cx + (r if k in (1, 2) else -r), cy + (r if k in (2, 3) else -r)); b2 = (cx + (r if k in (0, 1) else -r), cy + (r if k in (1, 2) else -r)) if False else None
            for sx, sy, tx, ty in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
                beam(B, (cx + sx * r, cy + sy * r, zz), (cx + tx * r, cy + ty * r, zz), 0.6, steel)
        # machinery house + jib (jib south over the river) and counter jib
        box3(B, cx, cy, 14, 12, z0 + 44, z0 + 52, steel * 0.9, mat=STEEL, capcol=darkc)
        beam(B, (cx, cy, z0 + 50), (cx, cy - 52, z0 + 49), 2.4, steel)
        beam(B, (cx, cy + 0, z0 + 50), (cx, cy + 22, z0 + 49), 2.4, steel)
        box3(B, cx, cy + 20, 7, 7, z0 + 44, z0 + 52, darkc, mat=STEEL)
        beam(B, (cx, cy, z0 + 62), (cx, cy - 50, z0 + 49.5), 0.7, steel)
        beam(B, (cx, cy, z0 + 62), (cx, cy + 20, z0 + 50), 0.7, steel)
        beam(B, (cx, cy, z0 + 52), (cx, cy, z0 + 62), 1.4, steel)
    # ---- SEC Armadillo (Clyde Auditorium): overlapping silver shells
    p = fp(D, "w10759864")
    if p is not None:
        ang, Lg, Wd, cx, cy = mrr(p); z0 = gmin(TR, p) - 0.3
        B, e = L("sec_armadillo", cx, cy); e["skip"].add("w10759864")
        box3(B, cx, cy, Lg * 0.95, Wd * 0.9, z0, z0 + 4, grey, ang=ang)
        n = 6; ca, sa = math.cos(ang), math.sin(ang)
        for k in range(n):
            u = (k - (n - 1) / 2) * (Lg * 0.8 / (n - 1)); sc = 1 - 0.3 * abs(k - (n - 1) / 2) / ((n - 1) / 2)
            dome(B, cx + u * ca, cy + u * sa, z0 + 2, Lg * 0.19, Wd * 0.46, 22 * sc + 4, silver, METAL, 20, 7, ang + math.pi / 2 * 0)
    # ---- OVO Hydro
    p = fp(D, "w188050166")
    if p is not None:
        cx, cy = p.centroid.x, p.centroid.y; b = p.bounds; z0 = gmin(TR, p) - 0.3
        rx = (b[2] - b[0]) / 2; ry = (b[3] - b[1]) / 2
        B, e = L("ovo_hydro", cx, cy); e["skip"].add("w188050166")
        prism(B, ngon(cx, cy, rx * 0.97, 40, ry * 0.97), z0, z0 + 18, silver * 0.9, METAL, cap=False)
        prism(B, ngon(cx, cy, rx * 0.985, 40, ry * 0.985), z0 + 12, z0 + 14, lin((0.30, 0.55, 0.85)), METAL, cap=False)
        dome(B, cx, cy, z0 + 18, rx * 0.97, ry * 0.97, 11, silver, METAL, 40, 6)
    # ---- Kelvingrove Art Gallery
    p = fp(D, "w26605473")
    if p is not None:
        b = p.bounds; cx, cy = p.centroid.x, p.centroid.y; z0 = gmin(TR, p) - 0.3
        B, e = L("kelvingrove_gallery", cx, cy); e["skip"].add("w26605473")
        prism(B, list(p.exterior.coords)[:-1], z0, z0 + 17, red, STONE, True, slate)
        for ty in (-1, 1):
            tx = b[2] - 14; tyy = cy + ty * 24
            box3(B, tx, tyy, 9, 9, z0, z0 + 33, red, mat=STONE, capcol=red)
            pyramid(B, rect(tx, tyy, 9.6, 9.6), z0 + 33, z0 + 46, slate * 1.0)
        for ty in (-1, 1):
            box3(B, b[0] + 10, cy + ty * 40, 7, 7, z0 + 15, z0 + 23, red, mat=STONE); pyramid(B, rect(b[0] + 10, cy + ty * 40, 7.4, 7.4), z0 + 23, z0 + 30, slate)
    # ---- City Chambers
    p = fp(D, "r900378")
    if p is not None:
        cx, cy = p.centroid.x, p.centroid.y; z0 = gmin(TR, p) - 0.3
        B, e = L("city_chambers", cx, cy); e["skip"].add("r900378")
        prism(B, list(p.exterior.coords)[:-1], z0, z0 + 26, sand, STONE, True, slate)
        ang, Lg, Wd, mx, my = mrr(p)
        tcx = mx + math.cos(ang + math.pi / 2) * (-Wd * 0.25) * 0; tcy = my
        tcx, tcy = mx, my
        box3(B, tcx, tcy, 11, 11, z0 + 20, z0 + 52, sand, ang=ang, capcol=sand)
        box3(B, tcx, tcy, 8, 8, z0 + 52, z0 + 60, sand, ang=ang)
        pyramid(B, rect(tcx, tcy, 8.8, 8.8, ang), z0 + 60, z0 + 70, copper)
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            q = rect(mx + 0.38 * Lg * sx * math.cos(ang) - 0.38 * Wd * sy * math.sin(ang), my + 0.38 * Lg * sx * math.sin(ang) + 0.38 * Wd * sy * math.cos(ang), 6, 6, ang)
            prism(B, q, z0 + 22, z0 + 33, sand, STONE); pyramid(B, q, z0 + 33, z0 + 40, copper)
    # ---- Glasgow University (Gilbert Scott) tower
    p = fp(D, "r11951")
    if p is not None:
        b = p.bounds; z0 = gmin(TR, p) - 0.3; cx = (b[0] + b[2]) / 2; cy = p.centroid.y
        B, e = L("university_main_building", cx, cy); e["skip"].add("r11951")
        prism(B, list(p.exterior.coords)[:-1], z0, z0 + 21, sand * 0.85, STONE, True, slate)
        # pitched roofs implied by dark lid; tower on the south range centre
        tx, ty = cx, b[1] + (b[3] - b[1]) * 0.18
        box3(B, tx, ty, 13, 13, z0 + 10, z0 + 50, sand * 0.8)
        box3(B, tx, ty, 10, 10, z0 + 50, z0 + 63, sand * 0.78)
        pyramid(B, ngon(tx, ty, 6.2, 8), z0 + 63, z0 + 86, sand * 0.7, ROOF)
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            q = rect(tx + sx * 5.5, ty + sy * 5.5, 2.6, 2.6); prism(B, q, z0 + 50, z0 + 62, sand * 0.8); pyramid(B, q, z0 + 62, z0 + 69, slate)
    # ---- Central Station
    p = fp(D, "w22925660")
    if p is not None:
        ang, Lg, Wd, cx, cy = mrr(p); z0 = gmin(TR, p) - 0.3
        B, e = L("central_station", cx, cy); e["skip"].add("w22925660")
        ca, sa = math.cos(ang), math.sin(ang)
        # concourse/train shed: three vaults across the width, along the long axis
        nv = 3 if Wd > 90 else 2
        for k in range(nv):
            v = (k - (nv - 1) / 2) * (Wd / nv)
            vault(B, cx - sa * v * -1 * 0 + (-sa) * v, cy + ca * v, ang, Wd / nv - 1.5, Lg * 0.72, z0 + 11, 9, glass * 1.0, steel * 0.8)
        # platform side walls
        box3(B, cx, cy, Lg * 0.72, Wd, z0, z0 + 11, sand * 0.6, ang=ang, mat=STONE, capcol=None) if False else None
        for sgn in (-1, 1):
            px = cx + (-sa) * sgn * Wd / 2; py = cy + ca * sgn * Wd / 2
            box3(B, px, py, Lg * 0.72, 1.0, z0, z0 + 11, sand * 0.7, ang=ang)
        # hotel / frontage block at the north end
        fx = cx + ca * (Lg / 2 - 25) * -1; fy = cy + sa * (Lg / 2 - 25) * -1
        box3(B, cx + ca * (Lg * 0.36 + 12), cy + sa * (Lg * 0.36 + 12), 28, Wd * 0.9, z0, z0 + 24, sand * 0.85, ang=ang, capcol=slate)
    # ---- Glasgow Tower + Science Centre
    p = fp(D, "w222709055")
    if p is not None:
        cx, cy = p.centroid.x, p.centroid.y; z0 = gmin(TR, p) - 0.3
        B, e = L("glasgow_tower", cx, cy); e["skip"].add("w222709055")
        def shaft(u, v):
            th = 2 * math.pi * u; h = v * 100; r = 4.5 - 1.7 * v
            return (cx + r * math.cos(th) * (1.0 + 0.0), cy + r * math.sin(th) * 0.6 + 0, z0 + h)
        # surf winding gives inward faces for cylinder -> use prism rings instead
        n = 14
        for k in range(8):
            za = z0 + k * 13; zb2 = z0 + (k + 1) * 13
            ra = 4.5 - 1.7 * k / 8; rb = 4.5 - 1.7 * (k + 1) / 8
            for q in range(n):
                t0 = 2 * math.pi * q / n; t1 = 2 * math.pi * (q + 1) / n
                B.add([(cx + ra * math.cos(t0), cy + ra * 0.7 * math.sin(t0), za), (cx + ra * math.cos(t1), cy + ra * 0.7 * math.sin(t1), za),
                       (cx + rb * math.cos(t1), cy + rb * 0.7 * math.sin(t1), zb2), (cx + rb * math.cos(t0), cy + rb * 0.7 * math.sin(t0), zb2)], [[0, 1, 2], [0, 2, 3]], silver * 0.95, None, METAL)
        zt = z0 + 104
        dome(B, cx, cy, zt, 3.0, 12, 3.0, silver, METAL, 14, 5, ang=math.pi / 2);
        dome(B, cx, cy, zt + 22 - 22, 5.5, 14, 17, silver * 0.95, METAL, 14, 6, ang=math.pi / 2)
    p = fp(D, "r21153720")
    if p is not None:
        ang, Lg, Wd, cx, cy = mrr(p); z0 = gmin(TR, p) - 0.3
        B, e = L("science_centre", cx, cy); e["skip"].add("r21153720")
        ca, sa = math.cos(ang), math.sin(ang)
        for k in range(3):
            u = (k - 1) * Lg * 0.3
            dome(B, cx + u * ca, cy + u * sa, z0 + 0.5, Lg * 0.2, Wd * 0.5, 14 - 2 * abs(k - 1), silver * 0.9, METAL, 20, 6, ang)
    # ---- Riverside Museum (zinc zigzag roof)
    p = fp(D, "r13348001")
    if p is not None:
        ang, Lg, Wd, cx, cy = mrr(p); z0 = gmin(TR, p) - 0.3
        B, e = L("riverside_museum", cx, cy); e["skip"].add("r13348001")
        ca, sa = math.cos(ang), math.sin(ang)
        prism(B, list(p.exterior.coords)[:-1], z0, z0 + 8, grey * 0.9, STONE, False)
        nz = 6
        def zf(u): return 7.5 + 6 * (1 - abs(((u * nz) % 1) * 2 - 1))
        for ysd in (0,):
            def f(u, v):
                x = (u - 0.5) * Lg * 0.96; y = (v - 0.5) * Wd * 0.96
                return (cx + x * ca - y * sa, cy + x * sa + y * ca, z0 + zf(u))
            surf(B, f, nz * 2, 1, silver * 0.8, METAL)
        # gable ends: flatten
    # ---- Glasgow Cathedral
    p = fp(D, "w102152591")
    if p is not None:
        cx, cy = p.centroid.x, p.centroid.y; z0 = gmin(TR, p) - 0.3
        ang, Lg, Wd, mx, my = mrr(p)
        B, e = L("glasgow_cathedral", cx, cy); e["skip"].add("w102152591")
        prism(B, list(p.exterior.coords)[:-1], z0, z0 + 16, lin((0.52, 0.48, 0.44)), STONE, True, slate)
        box3(B, mx, my, 8, 8, z0 + 10, z0 + 33, lin((0.52, 0.48, 0.44)), ang=ang)
        pyramid(B, ngon(mx, my, 4.2, 8), z0 + 33, z0 + 62, slate * 1.1, ROOF)
    # ---- Tolbooth Steeple
    p = fp(D, "w115356991")
    if p is not None:
        cx, cy = p.centroid.x, p.centroid.y; z0 = gmin(TR, p) - 0.3
        B, e = L("tolbooth_steeple", cx, cy); e["skip"].add("w115356991")
        box3(B, cx, cy, 6, 6, z0, z0 + 28, lin((0.62, 0.56, 0.48)), capcol=sand)
        box3(B, cx, cy, 4.4, 4.4, z0 + 28, z0 + 34, lin((0.62, 0.56, 0.48)))
        pyramid(B, rect(cx, cy, 4.8, 4.8), z0 + 34, z0 + 44, lin((0.5, 0.5, 0.48)))
    # ---- Mitchell Library dome
    p = fp(D, "w4326895")
    if p is not None:
        cx, cy = p.centroid.x, p.centroid.y; z0 = gmin(TR, p) - 0.3
        B, e = L("mitchell_library", cx, cy); e["skip"].add("w4326895")
        prism(B, list(p.exterior.coords)[:-1], z0, z0 + 24, sand * 0.95, STONE, True, slate)
        ang, Lg, Wd, mx, my = mrr(p)
        prism(B, ngon(mx, my, 8.5, 20), z0 + 20, z0 + 28, sand, STONE, False)
        dome(B, mx, my, z0 + 28, 8.5, 8.5, 8, copper, ROOF, 20, 6)
    # ---- Queen Street station shed & Royal Concert Hall
    p = fp(D, "w225910565")
    if p is not None:
        ang, Lg, Wd, cx, cy = mrr(p); z0 = gmin(TR, p) - 0.3
        B, e = L("queen_street_station", cx, cy); e["skip"].add("w225910565")
        prism(B, list(p.exterior.coords)[:-1], z0, z0 + 10, sand * 0.8, STONE, False)
        vault(B, cx, cy, ang, Wd * 0.92, Lg * 0.9, z0 + 10, 8, glass, steel * 0.8)
    p = fp(D, "w58705089")
    if p is not None:
        cx, cy = p.centroid.x, p.centroid.y; z0 = gmin(TR, p) - 0.3
        B, e = L("royal_concert_hall", cx, cy); e["skip"].add("w58705089")
        prism(B, list(p.exterior.coords)[:-1], z0, z0 + 24, lin((0.62, 0.55, 0.45)), STONE, True, darkc)
    # ---- Ibrox Stadium
    best = None
    for g, t, i in D["building"]:
        for q in polys_of(g):
            d = math.hypot(q.centroid.x + 2455, q.centroid.y + 763)
            if q.area > 4000 and d < 260 and (best is None or q.area > best[0].area): best = (q, i)
    if best is not None:
        q, ident = best; b = q.bounds
        cx, cy = q.centroid.x, q.centroid.y; z0 = gmin(TR, q) - 0.3
        ang, Lg, Wd, mx, my = mrr(q)
        B, e = L("ibrox_stadium", cx, cy); e["skip"].add(ident)
        # skip other buildings inside the footprint
        for g, t, i in D["building"]:
            for r in polys_of(g):
                if r.centroid.within(q.buffer(10)): e["skip"].add(i)
        def rr(w, d, k=6):
            pts = []
            for a in range(4 * k):
                th = 2 * math.pi * a / (4 * k); sx = 1 if math.cos(th) >= 0 else -1; sy = 1 if math.sin(th) >= 0 else -1
                pts.append((sx * (w / 2 - 10) + 10 * math.cos(th) * 1 + 0, sy * (d / 2 - 10) + 10 * math.sin(th)))
            return pts
        ca, sa = math.cos(ang), math.sin(ang)
        def tr_(pts): return [(mx + x * ca - y * sa, my + x * sa + y * ca) for x, y in pts]
        outer = tr_(rr(Lg, Wd)); innerL = Lg * 0.62; innerW = Wd * 0.55
        inner = tr_(rr(innerL, innerW)); lip = tr_(rr(innerL + 4, innerW + 4))
        n = len(outer); brick = lin((0.48, 0.25, 0.20)); seat = lin((0.62, 0.12, 0.12)); roofc = lin((0.30, 0.32, 0.36))
        prism(B, outer, z0, z0 + 26, brick, STONE, False)
        # roof (flat ring slab between outer and mid ring) at 26, stand slope below
        mid = tr_(rr(Lg * 0.8, Wd * 0.78))
        for k in range(n):
            k2 = (k + 1) % n
            # stand slope from rim of pitch (z0+2) up to the roof underside
            P = [(*lip[k], z0 + 2.0), (*lip[k2], z0 + 2.0), (*mid[k2], z0 + 24), (*mid[k], z0 + 24)]
            B.add(P, [[0, 1, 2], [0, 2, 3]], seat, None, STONE)
            P = [(*mid[k], z0 + 26), (*mid[k2], z0 + 26), (*outer[k2], z0 + 26), (*outer[k], z0 + 26)]
            B.add(P, [[0, 1, 2], [0, 2, 3]], roofc, None, ROOF)
            P = [(*mid[k], z0 + 24), (*mid[k2], z0 + 24), (*mid[k2], z0 + 26), (*mid[k], z0 + 26)]
            B.add(P, [[0, 1, 2], [0, 2, 3]], roofc, None, ROOF)
        # pitch
        Pp = [(*p_, z0 + 0.5) for p_ in inner]; V, T = earcut_poly(Polygon(inner))
        Pp = np.c_[V, np.full(len(V), z0 + 0.45)]
        B.add(Pp, flip_up(Pp, T.astype(np.int64)), lin((0.30, 0.62, 0.28)), None, STONE)
        # floodlight pylons
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            x, y = mx + sx * Lg * 0.46 * ca - sy * Wd * 0.46 * sa, my + sx * Lg * 0.46 * sa + sy * Wd * 0.46 * ca
            beam(B, (x, y, z0 + 24), (x, y, z0 + 42), 0.8, steel)
    # ---- Clyde Arc
    arc = None
    for g, t, i in D["road"]:
        if t.get("bridge") not in (None, "no") and ("Clyde Arc" in t.get("name", "") or "Squinty" in t.get("name", "")):
            if arc is None or g.length > arc.length: arc = g
    if arc is None:
        # fall back on any bridge way inside the Clyde Arc area
        area = box(-880, -375, -712, -250)
        for g, t, i in D["road"]:
            if t.get("bridge") not in (None, "no") and g.intersects(area) and g.length > 100 and (arc is None or g.length > arc.length): arc = g
    if False and arc is not None:
        pts = np.asarray(arc.coords); a0 = pts[0]; a1 = pts[-1]
        cx, cy = (a0 + a1) / 2; B, e = L("clyde_arc", cx, cy)
        d = a1 - a0; Ln = float(np.hypot(*d)); d /= Ln; nrm = np.array([-d[1], d[0]])
        zdeck = 9.2
        archpts = []
        for k in range(0, 21):
            f = k / 20; p3 = a0 + (a1 - a0) * f + nrm * 11 * (1 - 0.0)
            archpts.append((p3[0], p3[1], zdeck + 36 * math.sin(math.pi * f) ** 0.9))
        # lean the arch outwards: arch springs from the deck edge at the nearside, peak above offset
        for k in range(20): beam(B, archpts[k], archpts[k + 1], 1.6, lin((0.7, 0.72, 0.75)), STEEL)
        for k in range(1, 20):
            f = k / 20; p3 = a0 + (a1 - a0) * f
            beam(B, (p3[0] + nrm[0] * 6, p3[1] + nrm[1] * 6, zdeck + 0.6), archpts[k], 0.25, lin((0.8, 0.8, 0.82)), STEEL)
        beam(B, (a0[0] + nrm[0] * 11, a0[1] + nrm[1] * 11, zdeck), (a0[0] + nrm[0] * 11, a0[1] + nrm[1] * 11, zdeck - 6), 2.2, lin((0.55, 0.55, 0.55)), STEEL)
        beam(B, (a1[0] + nrm[0] * 11, a1[1] + nrm[1] * 11, zdeck), (a1[0] + nrm[0] * 11, a1[1] + nrm[1] * 11, zdeck - 6), 2.2, lin((0.55, 0.55, 0.55)), STEEL)
        out[-1]["arc_line"] = arc
    log("landmarks:", [o["name"] for o in out])
    return out

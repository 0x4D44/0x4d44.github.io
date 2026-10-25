"""Shared helpers for the city builder: terrain sampling, mesh buffers, triangulation, colours.
Python-side coordinates: (x east, y north, z up) == Blender. World (three.js) z = -y."""
import math, os, json
import numpy as np
import triangle, mapbox_earcut
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from scipy import ndimage as ndi


def srgb2lin(c):
    c = np.asarray(c, np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin(c, a=1.0):
    v = srgb2lin(c)
    return np.array([v[0], v[1], v[2], a], np.float32)


class Terr:
    def __init__(self, work):
        m = json.load(open(os.path.join(work, "dem_meta.json")))
        self.H = np.load(os.path.join(work, "terrain_final.npy")).astype(np.float64)
        self.WL = np.load(os.path.join(work, "water_level.npy"))
        self.minX, self.minZ, self.C = m["minX"], m["minZ"], m["cell"]
        self.nx, self.nz = m["nx"], m["nz"]
        self.maxX, self.maxZ = m["maxX"], m["maxZ"]
        self.Hc = self.H[::2, ::2]
        # fill water level raster (nan -> nearest valid)
        wl = self.WL.copy(); bad = np.isnan(wl)
        if (~bad).any():
            idx = ndi.distance_transform_edt(bad, return_distances=False, return_indices=True)
            wl = wl[tuple(idx)]
        else:
            wl[:] = 3.0
        self.WLf = wl

    def _bil(self, G, C, x, y):
        x = np.asarray(x, np.float64); y = np.asarray(y, np.float64)
        u = (x - self.minX) / C; v = (-y - self.minZ) / C
        nz, nx = G.shape
        u = np.clip(u, 0, nx - 1.001); v = np.clip(v, 0, nz - 1.001)
        i = u.astype(int); j = v.astype(int); fu = u - i; fv = v - j
        return (G[j, i] * (1 - fu) * (1 - fv) + G[j, i + 1] * fu * (1 - fv) + G[j + 1, i] * (1 - fu) * fv + G[j + 1, i + 1] * fu * fv)

    def h(self, x, y, step=1):
        return self._bil(self.H if step == 1 else self.Hc, self.C * step, x, y)

    def wl(self, x, y):
        return self._bil(self.WLf, self.C, x, y)


class Buf:
    """Accumulates indexed triangle meshes with per-vertex colour / uv and per-face material."""
    def __init__(self):
        self.P = []; self.C = []; self.U = []; self.T = []; self.M = []; self.n = 0

    def add(self, pos, tris, col, uv=None, mat=0):
        pos = np.asarray(pos, np.float32).reshape(-1, 3); n = len(pos)
        if n == 0 or len(tris) == 0: return
        col = np.asarray(col, np.float32)
        if col.ndim == 1: col = np.tile(col, (n, 1))
        if uv is None: uv = np.zeros((n, 2), np.float32)
        tris = np.asarray(tris, np.int64).reshape(-1, 3)
        self.P.append(pos); self.C.append(col.astype(np.float32)); self.U.append(np.asarray(uv, np.float32).reshape(-1, 2))
        self.T.append(tris + self.n); self.M.append(np.full(len(tris), mat, np.int32)); self.n += n

    def empty(self): return self.n == 0

    def arrays(self):
        return (np.concatenate(self.P), np.concatenate(self.C), np.concatenate(self.U), np.concatenate(self.T), np.concatenate(self.M))

    def tris(self): return sum(len(t) for t in self.T)


def flip_up(P, T):
    """Make triangles face +Z (for ground-like surfaces)."""
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    nz = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    T = T.copy(); f = nz < 0
    T[f] = T[f][:, [0, 2, 1]]
    return T


def polys_of(g):
    if g is None or g.is_empty: return []
    if g.geom_type == "Polygon": return [g]
    if g.geom_type in ("MultiPolygon", "GeometryCollection"): return [p for x in g.geoms for p in polys_of(x)]
    return []


def densify_ring(coords, L, bounds=None, Lb=5.0):
    """Insert points so segments are <= L. Segments lying on chunk bounds are split at global multiples of Lb (so neighbours match)."""
    out = []
    n = len(coords)
    for k in range(n - 1):
        a = coords[k]; b = coords[k + 1]
        out.append(a)
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy)
        if bounds is not None:
            x0, y0, x1, y1 = bounds
            on = None
            if abs(a[0] - b[0]) < 1e-6 and (abs(a[0] - x0) < 1e-6 or abs(a[0] - x1) < 1e-6): on = 1
            elif abs(a[1] - b[1]) < 1e-6 and (abs(a[1] - y0) < 1e-6 or abs(a[1] - y1) < 1e-6): on = 0
            if on is not None:
                lo, hi = (a[on], b[on]) if a[on] < b[on] else (b[on], a[on])
                ts = np.arange(math.floor(lo / Lb) * Lb + Lb, hi - 1e-6, Lb)
                pts = [((a[0] + (t - a[on]) / (b[on] - a[on]) * dx), (a[1] + (t - a[on]) / (b[on] - a[on]) * dy)) for t in ts] if abs(b[on] - a[on]) > 1e-9 else []
                if b[on] < a[on]: pts = pts[::-1]
                out.extend(pts); continue
        if d > L:
            m = int(math.ceil(d / L))
            for q in range(1, m): out.append((a[0] + dx * q / m, a[1] + dy * q / m))
    out.append(coords[-1])
    return out


def tri_polygon(poly, maxarea, seglen=12.0, bounds=None, minarea=0.3):
    """Constrained-Delaunay triangulate a shapely polygon (with holes) with interior Steiner points. -> (V (n,2), T (m,3))"""
    if poly.is_empty or poly.area < minarea: return None
    verts = []; segs = []; holes = []
    def add_ring(r):
        c = densify_ring([tuple(p) for p in r.coords], seglen, bounds)
        c = c[:-1]
        base = len(verts)
        # drop near-duplicates
        cl = []
        for p in c:
            if cl and abs(cl[-1][0] - p[0]) < 1e-4 and abs(cl[-1][1] - p[1]) < 1e-4: continue
            cl.append(p)
        if len(cl) > 1 and abs(cl[0][0] - cl[-1][0]) < 1e-4 and abs(cl[0][1] - cl[-1][1]) < 1e-4: cl.pop()
        if len(cl) < 3: return False
        verts.extend(cl)
        for k in range(len(cl)): segs.append((base + k, base + (k + 1) % len(cl)))
        return True
    if not add_ring(poly.exterior): return None
    for it in poly.interiors:
        if Polygon(it).area < 0.2: continue
        s0 = len(verts)
        if add_ring(it):
            hp = Polygon(it).representative_point(); holes.append((hp.x, hp.y))
    A = dict(vertices=np.array(verts, np.float64), segments=np.array(segs, np.int32))
    if holes: A["holes"] = np.array(holes, np.float64)
    try:
        r = triangle.triangulate(A, "pQa%.1f" % maxarea)
    except Exception:
        try: r = triangle.triangulate(A, "pQ")
        except Exception: return None
    if "triangles" not in r or len(r["triangles"]) == 0: return None
    return r["vertices"], r["triangles"]


def earcut_poly(poly):
    """Triangulate polygon with holes (2D). -> V(n,2), T(m,3)"""
    rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(i.coords)[:-1] for i in poly.interiors if len(i.coords) > 3]
    V = np.concatenate(rings).astype(np.float32); ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    T = mapbox_earcut.triangulate_float32(V, ends).reshape(-1, 3)
    return V, T


def ribbon(pts, width, step=4.0):
    """Polyline -> left/right offset points at roughly `step` spacing. returns (L (n,2), R (n,2), s (n,)) with miter-ish normals."""
    pts = np.asarray(pts, np.float64)
    seg = np.hypot(*(pts[1:] - pts[:-1]).T)
    keep = np.concatenate([[True], seg > 1e-6]); pts = pts[keep]
    if len(pts) < 2: return None
    # resample
    seg = np.hypot(*(pts[1:] - pts[:-1]).T); s = np.concatenate([[0], np.cumsum(seg)])
    n = max(2, int(math.ceil(s[-1] / step)) + 1)
    ss = np.linspace(0, s[-1], n)
    px = np.interp(ss, s, pts[:, 0]); py = np.interp(ss, s, pts[:, 1])
    # keep original vertices too (preserve corners)
    allS = np.unique(np.concatenate([ss, s])); px = np.interp(allS, s, pts[:, 0]); py = np.interp(allS, s, pts[:, 1]); ss = allS
    dx = np.gradient(px); dy = np.gradient(py)
    # tangent via neighbours
    tx = np.zeros_like(px); ty = np.zeros_like(py)
    tx[1:-1] = px[2:] - px[:-2]; ty[1:-1] = py[2:] - py[:-2]
    tx[0] = px[1] - px[0]; ty[0] = py[1] - py[0]; tx[-1] = px[-1] - px[-2]; ty[-1] = py[-1] - py[-2]
    d = np.hypot(tx, ty); d[d == 0] = 1; tx /= d; ty /= d
    nxn = -ty; nyn = tx
    hw = width / 2
    L = np.stack([px + nxn * hw, py + nyn * hw], 1); R = np.stack([px - nxn * hw, py - nyn * hw], 1)
    C = np.stack([px, py], 1)
    return L, R, C, ss


def hash01(s, salt=0):
    h = 2166136261
    for ch in (str(s) + "|" + str(salt)):
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    h ^= h >> 15; h = (h * 2246822519) & 0xFFFFFFFF; h ^= h >> 13
    return (h & 0xFFFFFF) / float(0x1000000)

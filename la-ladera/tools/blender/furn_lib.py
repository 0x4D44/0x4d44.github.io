"""Furniture builder library for La Ladera interiors (A3).  Runs inside Blender:

    blender --background --factory-startup --python tools/blender/furn_build.py -- --catalog cat.json --out <models dir> [--only key,key] [--theme living]

Geometry is generated in the GAME frame (x right, +y up, +z = the FRONT of the item, metres) with analytic normals and metric UVs, then
handed to Blender (X, -Z, Y) and exported with the glTF exporter (+Y up) so the file is in the game frame again.  Conventions (see js/interiors/catalog.js):
  every asset is a root Empty named by its CATALOGUE KEY; its footprint is centred on the origin (x in +-W/2, z in +-D/2), its base is at y = 0 and it
  rises to y = H (ceiling fixtures hang from y = H: build.js puts that top against the ceiling).
  every child mesh is named  <key>-<flag>-...-<n>  and uses ONE library material (the glTF material NAME is the core/matlib.js name, no textures are embedded).
  flags:  tint  = the part takes the record's tint colour (its vertex colours, if any, are shades that multiply it)
          made / unmade = the bed variants; pa0..paN (and pb, pc...) = alternative channels picked by the record id; magnets = only when the record asks.
  a part without the `tint` flag keeps its own vertex colours (COLOR_0, linear) - small coloured things are drawn with plastic_solid + colour, so a
  building still costs one draw call per material.
"""
import bpy, math, os, sys, json
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))                     # la-ladera/


def argv_after_dashes():
    a = sys.argv
    return a[a.index('--') + 1:] if '--' in a else a[1:]


# ---------------------------------------------------------------------------------------------------------------- colour
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin3(h):
    """0xRRGGBB (sRGB, as written in standins.js) -> linear floats."""
    return (_lin(((h >> 16) & 255) / 255.0), _lin(((h >> 8) & 255) / 255.0), _lin((h & 255) / 255.0))


def mulc(h, k):
    """Multiply the sRGB channels like standins.js mul()."""
    f = lambda s: min(255, int(((h >> s) & 255) * k))
    return (f(16) << 16) | (f(8) << 8) | f(0)


def mixc(a, b, t):
    f = lambda s: int(round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t))
    return (f(16) << 16) | (f(8) << 8) | f(0)


def shade(k):
    """A grey (sRGB) that darkens a tinted part by k, the same as mul(tint, k) in the stand-ins."""
    v = max(0, min(255, int(round(255 * k))))
    return (v << 16) | (v << 8) | v


# ---------------------------------------------------------------------------------------------------------------- vectors
def _len(v): return math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
def _unit(v):
    l = _len(v) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)
def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _rotm(rx, ry, rz):
    """R = Ry * Rx * Rz (three.js Euler 'YXZ'), rows."""
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rz = ((cz, -sz, 0), (sz, cz, 0), (0, 0, 1))
    Rx = ((1, 0, 0), (0, cx, -sx), (0, sx, cx))
    Ry = ((cy, 0, sy), (0, 1, 0), (-sy, 0, cy))
    mm = lambda A, B: tuple(tuple(sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)) for i in range(3))
    return mm(Ry, mm(Rx, Rz))


def _apply(M, v): return (M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2])


# ---------------------------------------------------------------------------------------------------------------- geometry
class Geo:
    """Triangles with one position / normal / uv / colour per vertex (vertices are not shared between primitives)."""
    def __init__(self):
        self.P, self.N, self.UV, self.C, self.I = [], [], [], [], []
        self.has_col = False

    def add(self, pos, nor, uv, tris, col):
        base = len(self.P)
        self.P.extend(pos); self.N.extend(nor); self.UV.extend(uv)
        c = lin3(col) if col is not None else (1.0, 1.0, 1.0)
        if col is not None: self.has_col = True
        self.C.extend([c] * len(pos))
        for a, b, d in tris:
            pa, pb, pd = pos[a], pos[b], pos[d]
            fn = _cross(_sub(pb, pa), _sub(pd, pa))
            if _len(fn) < 1e-11: continue                                  # degenerate (cone apex, zero-width strips)
            ns = (nor[a][0] + nor[b][0] + nor[d][0], nor[a][1] + nor[b][1] + nor[d][1], nor[a][2] + nor[b][2] + nor[d][2])
            if _dot(fn, ns) < 0: b, d = d, b                              # winding always agrees with the analytic normals
            self.I.append((base + a, base + b, base + d))


def _zone(h, r, m):
    """Sample coordinates across one box axis from -h to +h: a rounded edge gets m+1 samples per side, equal steps of angle (so two faces meet at 45 degrees)."""
    if r <= 1e-9: return [-h, h]
    lo = [-h + r - r * math.tan(math.radians(45.0 * k / m)) for k in range(m, -1, -1)]
    return lo + [-x for x in reversed(lo)]


def rbox_geo(hx, hy, hz, r=0.0, m=1, skip=()):
    """Box of half sizes hx,hy,hz centred on the origin; edges rounded with radius r (clamped), m = steps per 45 degrees."""
    h = (hx, hy, hz)
    r = max(0.0, min(r, hx, hy, hz))
    pos, nor, uv, tris = [], [], [], []
    for ai in range(3):
        for sgn in (1, -1):
            if ('p' if sgn > 0 else 'n') + 'xyz'[ai] in skip: continue
            b, c = (ai + 1) % 3, (ai + 2) % 3
            Sb, Sc = _zone(h[b], r, m), _zone(h[c], r, m)
            base = len(pos)
            for ub in Sb:
                for uc in Sc:
                    q = [0.0, 0.0, 0.0]; q[ai] = sgn * h[ai]; q[b] = ub; q[c] = uc
                    if r > 0:
                        inner = [max(-(h[k] - r), min(h[k] - r, q[k])) for k in range(3)]
                        d = [q[k] - inner[k] for k in range(3)]
                        ln = math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) or 1.0
                        n = (d[0] / ln, d[1] / ln, d[2] / ln)
                        p = (inner[0] + r * n[0], inner[1] + r * n[1], inner[2] + r * n[2])
                    else:
                        p = (q[0], q[1], q[2]); n = [0.0, 0.0, 0.0]; n[ai] = float(sgn); n = tuple(n)
                    pos.append(p); nor.append(n)
                    uv.append((p[2], p[1]) if ai == 0 else (p[0], p[2]) if ai == 1 else (p[0], p[1]))
            nb, nc = len(Sb), len(Sc)
            for i in range(nb - 1):
                for j in range(nc - 1):
                    a0 = base + i * nc + j; a1 = base + (i + 1) * nc + j; a2 = base + (i + 1) * nc + j + 1; a3 = base + i * nc + j + 1
                    tris.append((a0, a1, a2)); tris.append((a0, a2, a3))
    return pos, nor, uv, tris


def lathe_geo(profile, n=16, crease=40.0):
    """Surface of revolution about the y axis.  profile = [(radius, y), ...]; walking up the profile the outward normal is (dy, -dr),
    so a closed solid is  [(0, y0), (r, y0), (r, y1), (0, y1)].  Corners sharper than `crease` degrees stay sharp."""
    segs = []
    for i in range(len(profile) - 1):
        (r0, y0), (r1, y1) = profile[i], profile[i + 1]
        dr, dy = r1 - r0, y1 - y0
        l = math.hypot(dr, dy)
        if l < 1e-9: segs.append(None); continue
        segs.append(((dy / l, -dr / l), l))
    cr = math.cos(math.radians(crease))
    pos, nor, uv, tris = [], [], [], []
    for i, sg in enumerate(segs):
        if sg is None: continue
        (nr, ny), _l = sg
        ends = []
        for end in (0, 1):                                                  # smooth with the neighbour unless the corner is sharp
            nb = segs[i - 1] if (end == 0 and i > 0) else segs[i + 1] if (end == 1 and i + 1 < len(segs)) else None
            if nb is not None and nb[0][0] * nr + nb[0][1] * ny > cr:
                sr, sy = nr + nb[0][0], ny + nb[0][1]; ll = math.hypot(sr, sy) or 1.0; ends.append((sr / ll, sy / ll))
            else: ends.append((nr, ny))
        (ra, ya), (rb, yb) = profile[i], profile[i + 1]
        flat = abs(yb - ya) < 1e-6
        rm = (ra + rb) / 2.0
        base = len(pos)
        for end, (rr, yy) in enumerate(((ra, ya), (rb, yb))):
            en = ends[end]
            for j in range(n + 1):
                t = 2.0 * math.pi * j / n; c, s = math.cos(t), math.sin(t)
                pos.append((rr * c, yy, rr * s)); nor.append((en[0] * c, en[1], en[0] * s))
                uv.append((rr * c, rr * s) if flat else (t * max(rm, 0.01), yy))
        for j in range(n):
            a0, a1, b0, b1 = base + j, base + j + 1, base + (n + 1) + j, base + (n + 1) + j + 1
            tris.append((a0, b0, b1)); tris.append((a0, b1, a1))
    return pos, nor, uv, tris


def tube_geo(pts, rad, n=6, caps=True):
    """Round bar along a polyline; rad may be a number or one radius per point."""
    k = len(pts)
    rads = rad if isinstance(rad, (list, tuple)) else [rad] * k
    rings = []
    for i in range(k):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, k - 1)]
        t = _unit(_sub(b, a))
        up = (0.0, 1.0, 0.0) if abs(t[1]) < 0.95 else (1.0, 0.0, 0.0)
        u = _unit(_cross(up, t)); v = _cross(t, u)
        ring = []
        for j in range(n):
            ang = 2 * math.pi * j / n; c, s = math.cos(ang), math.sin(ang)
            nn = (u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s)
            ring.append(((pts[i][0] + nn[0] * rads[i], pts[i][1] + nn[1] * rads[i], pts[i][2] + nn[2] * rads[i]), nn))
        rings.append(ring)
    pos, nor, uv, tris = [], [], [], []
    acc = 0.0
    for i in range(k):
        if i: acc += _len(_sub(pts[i], pts[i - 1]))
        for j in range(n):
            p, nn = rings[i][j]; pos.append(p); nor.append(nn); uv.append((2 * math.pi * rads[i] * j / n, acc))
    for i in range(k - 1):
        for j in range(n):
            a0, a1 = i * n + j, i * n + (j + 1) % n; b0, b1 = (i + 1) * n + j, (i + 1) * n + (j + 1) % n
            tris.append((a0, b0, b1)); tris.append((a0, b1, a1))
    if caps:
        for idx, end in ((0, 0), (k - 1, 1)):
            t = _unit(_sub(pts[1], pts[0])) if end == 0 else _unit(_sub(pts[-1], pts[-2]))
            nn = (-t[0], -t[1], -t[2]) if end == 0 else t
            c0 = len(pos); pos.append(pts[idx]); nor.append(nn); uv.append((0, 0))
            for j in range(n):
                p, _ = rings[idx][j]; pos.append(p); nor.append(nn); uv.append((p[0], p[2]))
            for j in range(n): tris.append((c0, c0 + 1 + j, c0 + 1 + (j + 1) % n))
    return pos, nor, uv, tris


def arc(cx, cy, cz, r, a0, a1, plane='xy', steps=6):
    """Points on an arc (degrees) in the xy / yz / xz plane, for bent bars."""
    out = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps); c, s = math.cos(a) * r, math.sin(a) * r
        out.append((cx + c, cy + s, cz) if plane == 'xy' else (cx, cy + c, cz + s) if plane == 'yz' else (cx + c, cy, cz + s))
    return out


# ---------------------------------------------------------------------------------------------------------------- asset
class Asset:
    """One catalogue key: collects primitives into groups (material, tint?, flags) and later becomes a root Empty with one mesh per group."""
    def __init__(self, key, cat):
        self.key, self.cat = key, cat
        self.W, self.H, self.D = cat['size']
        self.groups = OrderedDict()
        self.lo = [1e9, 1e9, 1e9]; self.hi = [-1e9, -1e9, -1e9]

    def _emit(self, mat, geom, col, tint, flags, rot=(0, 0, 0), off=(0, 0, 0), scl=None):
        pos, nor, uv, tris = geom
        M = _rotm(*rot) if any(rot) else None
        P2, N2 = [], []
        for p, n in zip(pos, nor):
            if scl is not None:
                p = (p[0] * scl[0], p[1] * scl[1], p[2] * scl[2])
                n = _unit((n[0] / scl[0], n[1] / scl[1], n[2] / scl[2]))
            if M is not None: p = _apply(M, p); n = _apply(M, n)
            p = (p[0] + off[0], p[1] + off[1], p[2] + off[2])
            P2.append(p); N2.append(n)
            for k in range(3):
                if p[k] < self.lo[k]: self.lo[k] = p[k]
                if p[k] > self.hi[k]: self.hi[k] = p[k]
        key = (mat, bool(tint), tuple(flags))
        g = self.groups.get(key)
        if g is None: g = self.groups[key] = Geo()
        g.add(P2, N2, uv, tris, col)

    # lx,lz = centre of the part in the item's footprint, ly = its bottom; sizes sx,sy,sz.  r = edge radius, m = steps (1 = 2 segments per edge)
    def box(self, mat, lx, ly, lz, sx, sy, sz, col=None, tint=False, r=0.0, m=1, ry=0.0, rx=0.0, rz=0.0, skip=(), flags=()):
        if not (sx > 0 and sy > 0 and sz > 0): return
        self._emit(mat, rbox_geo(sx / 2, sy / 2, sz / 2, r, m, skip), col, tint, flags, (rx, ry, rz), (lx, ly + sy / 2, lz))

    def cyl(self, mat, lx, ly, lz, rad, h, n=14, r1=None, col=None, tint=False, caps=True, ry=0.0, rx=0.0, rz=0.0, flags=(), crease=40.0):
        r1 = rad if r1 is None else r1
        prof = ([(0.0, 0.0)] if caps else []) + [(rad, 0.0), (r1, h)] + ([(0.0, h)] if (caps and r1 > 0) else [])
        self._emit(mat, lathe_geo(prof, n, crease), col, tint, flags, (rx, ry, rz), (lx, ly, lz))

    def hcyl(self, mat, lx, ly, lz, rad, length, axis='x', n=12, col=None, tint=False, r1=None, flags=(), caps=True):
        """Horizontal bar centred at (lx, ly, lz); axis 'x' or 'z'.  r1 = radius at the +axis end."""
        rot = (0, 0, -math.pi / 2) if axis == 'x' else (math.pi / 2, 0, 0)
        r1 = rad if r1 is None else r1
        prof = ([(0.0, -length / 2)] if caps else []) + [(rad, -length / 2), (r1, length / 2)] + ([(0.0, length / 2)] if (caps and r1 > 0) else [])
        self._emit(mat, lathe_geo(prof, n), col, tint, flags, rot, (lx, ly, lz))

    def sph(self, mat, lx, ly, lz, rx, ry=None, rz=None, n=12, col=None, tint=False, flags=(), rot=(0, 0, 0)):
        ry = rx if ry is None else ry; rz = rx if rz is None else rz
        k = max(4, n // 2)
        prof = [(math.cos(-math.pi / 2 + math.pi * i / k) * 0.999999, math.sin(-math.pi / 2 + math.pi * i / k)) for i in range(k + 1)]
        self._emit(mat, lathe_geo(prof, n, 90.0), col, tint, flags, rot, (lx, ly, lz), (rx, ry, rz))

    def lathe(self, mat, lx, ly, lz, profile, n=16, col=None, tint=False, crease=40.0, flags=(), rot=(0, 0, 0), scl=None):
        self._emit(mat, lathe_geo(profile, n, crease), col, tint, flags, rot, (lx, ly, lz), scl)

    def tube(self, mat, pts, rad, n=6, col=None, tint=False, flags=(), caps=True):
        self._emit(mat, tube_geo(pts, rad, n, caps), col, tint, flags)

    def legs4(self, mat, w, d, h, t=0.04, inset=0.03, lz=0.0, col=None, tint=False, round_=False, r1=None, flags=()):
        for sx in (-1, 1):
            for sz in (-1, 1):
                x, z = sx * (w / 2 - inset - t / 2), lz + sz * (d / 2 - inset - t / 2)
                if round_: self.cyl(mat, x, 0, z, t / 2, h, 8, r1=(r1 if r1 is not None else t / 2) , col=col, tint=tint, caps=False, flags=flags)
                else: self.box(mat, x, 0, z, t, h, t, col, tint, skip=('ny', 'py'), flags=flags)

    # ------------------------------------------------------------------------------------------------ report
    def bounds(self):
        return [self.lo[k] for k in range(3)], [self.hi[k] for k in range(3)]


# ---------------------------------------------------------------------------------------------------------------- registry
BUILDERS = OrderedDict()                                                   # key -> (theme, fn)


def asset(theme, *keys):
    def deco(fn):
        for k in keys:
            if k in BUILDERS:
                raise ValueError('Duplicate furniture builder: ' + k)
            BUILDERS[k] = (theme, fn)
        return fn
    return deco


# ---------------------------------------------------------------------------------------------------------------- blender
def to_blender(p):
    return (p[0], -p[2], p[1])


_mats = {}


def get_mat(name):
    m = _mats.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.diffuse_color = (0.8, 0.8, 0.8, 1.0)
        _mats[name] = m
    return m


def build_objects(a, scene_col):
    """Asset -> root Empty (named by the catalogue key) + one mesh object per group.  Returns the root."""
    root = bpy.data.objects.new(a.key, None); root.empty_display_type = 'PLAIN_AXES'
    scene_col.objects.link(root)
    for gi, ((mat, tint, flags), g) in enumerate(a.groups.items()):
        if not g.I: continue
        name = '-'.join([a.key] + (['tint'] if tint else []) + list(flags) + [str(gi)])
        me = bpy.data.meshes.new(name)
        me.from_pydata([to_blender(p) for p in g.P], [], g.I)
        me.update(calc_edges=True)
        nl = len(g.I) * 3
        uvl = me.uv_layers.new(name='UVMap')
        flat = []
        for t in g.I:
            for vi in t: flat.extend(g.UV[vi])
        uvl.data.foreach_set('uv', flat)
        if g.has_col:
            ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = ca
            fc = []
            for t in g.I:
                for vi in t: fc.extend(g.C[vi]); fc.append(1.0)
            ca.data.foreach_set('color', fc)
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.normals_split_custom_set([to_blender(g.N[vi]) for t in g.I for vi in t])
        me.materials.append(get_mat(mat))
        ob = bpy.data.objects.new(name, me)
        scene_col.objects.link(ob); ob.parent = root
    return root


def export_glb(path):
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=False, export_materials='EXPORT', export_image_format='NONE',
              export_vertex_color='ACTIVE', export_cameras=False, export_lights=False, export_normals=True, export_texcoords=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        for k in ('export_vertex_color', 'export_normals', 'export_texcoords'): kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()

"""Bridge modelling: merge OSM bridge ways (+ man_made=bridge areas) into clusters, build decks, girders/arch spandrels,
parapets, piers, rails, footbridge towers. Used by city_build.py (all heights from the 10 m terrain + water level)."""
import math
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from city_lib import *
from city_landmarks import prism, beam

STONE_C = (0.64, 0.56, 0.45); CONC_C = (0.60, 0.59, 0.57); STEEL_C = (0.22, 0.27, 0.27); DARK_C = (0.20, 0.20, 0.21)


def make_clusters(D, W, road_width):
    water = W["water_union"]
    kinds = {"road": W["bridges"], "rail": W["rbridges"]}
    comps = []
    for kind, items in kinds.items():
        buf = []
        for g, t, i in items:
            hw = (road_width(t) / 2 + 0.7) if kind == "road" else (1.9 if t.get("service") in ("siding", "yard", "crossover") else 2.6)
            buf.append(g.buffer(hw, quad_segs=2))
        if not buf: continue
        u = unary_union(buf)
        for p in polys_of(u):
            ls = [(g, t, i) for g, t, i in items if p.buffer(0.5).contains(g.interpolate(0.5, normalized=True))]
            if not ls: continue
            comps.append(dict(poly=p, kind=kind, lines=ls, struct=None, name=None))
    # attach man_made=bridge areas
    for g, t, i in D["bridgearea"]:
        if not g.is_valid or g.area > 30000: continue
        best = None
        for c in comps:
            inter = c["poly"].intersection(g).area
            if inter > 0.15 * min(c["poly"].area, g.area) and (best is None or inter > best[0]): best = (inter, c)
        if best is None: continue
        # merge every same-kind comp that overlaps the area
        kind = best[1]["kind"]
        mem = [c for c in comps if c["kind"] == kind and c["poly"].intersection(g).area > 0.15 * min(c["poly"].area, g.area)]
        poly = unary_union([c["poly"] for c in mem] + [g]).buffer(0)
        if poly.geom_type != "Polygon": poly = max(polys_of(poly), key=lambda q: q.area)
        lines = [l for c in mem for l in c["lines"]]
        for c in mem: comps.remove(c)
        comps.append(dict(poly=poly, kind=kind, lines=lines, struct=t.get("bridge:structure"), name=t.get("name")))
    # finish
    out = []
    for c in comps:
        if c["name"] is None:
            for g, t, i in c["lines"]:
                if t.get("name"): c["name"] = t["name"]; break
        hw = [t.get("highway") for g, t, i in c["lines"]]
        if c["kind"] == "road" and all(h in ("footway", "path", "cycleway", "pedestrian", "steps") for h in hw): c["kind"] = "ped"
        # axis: length-weighted mean chord direction
        a = np.zeros(2); first = None
        for g, t, i in c["lines"]:
            co = np.asarray(g.coords); d = co[-1] - co[0]
            if np.hypot(*d) < 1e-6: continue
            if first is None: first = d
            a += d * np.sign(np.dot(d, first)) if np.dot(d, first) != 0 else d
        if np.hypot(*a) < 1e-6:
            m = c["poly"].minimum_rotated_rectangle.exterior.coords; a = np.array(m[1]) - np.array(m[0])
        c["axis"] = a / np.hypot(*a)
        out.append(c)
    return out


def _smooth(z, n=2):
    k = np.ones(2 * n + 1) / (2 * n + 1)
    zp = np.pad(z, n, mode="edge"); return np.convolve(zp, k, mode="valid")


def build_cluster(c, TR, W, step, Bdeck, Brail, Bstruct, Brails):
    """Appends geometry: Bdeck (road deck, slot 0 of roads), Brail (rail ballast deck + rails, slot 0 of rail), Bstruct (bridge material, slot 2 of roads)."""
    P = orient(c["poly"], 1.0); kind = c["kind"]; ax, ay = c["axis"]; nx_, ny_ = -ay, ax
    cen = P.centroid; cx, cy = cen.x, cen.y
    name = c["name"] or ""
    ext = np.asarray(P.exterior.coords)
    sv = (ext[:, 0] - cx) * ax + (ext[:, 1] - cy) * ay; uv_ = (ext[:, 0] - cx) * nx_ + (ext[:, 1] - cy) * ny_
    s0, s1 = float(sv.min()), float(sv.max()); u0, u1 = float(uv_.min()), float(uv_.max())
    Ltot = s1 - s0
    if Ltot < 6: return 0
    S = np.arange(s0, s1 + 1.5, 2.0); S[-1] = min(S[-1], s1)
    if len(S) < 2: S = np.array([s0, s1])
    # chord samples
    gmax = np.zeros(len(S)); gmin = np.zeros(len(S)); wat = np.zeros(len(S), bool); has = np.zeros(len(S), bool); gend = {}
    Pb = P.buffer(0.5)
    us = np.linspace(u0, u1, max(5, int((u1 - u0) / 4) + 1))
    for k, s in enumerate(S):
        xs = cx + ax * s + nx_ * us; ys = cy + ay * s + ny_ * us
        ins = shapely.contains_xy(Pb, xs, ys)
        if not ins.any(): continue
        g = TR.h(xs[ins], ys[ins], 1); gmax[k] = g.max(); gmin[k] = g.min(); has[k] = True
        wat[k] = shapely.contains_xy(W["water_union"], xs[ins], ys[ins]).any()
    if not has.any(): return 0
    idx = np.arange(len(S)); gmax = np.interp(idx, idx[has], gmax[has]); gmin = np.interp(idx, idx[has], gmin[has])
    nn = max(1, min(3, len(S) // 4))
    g0 = float(gmax[:nn].mean()); g1 = float(gmax[-nn:].mean())
    clr = {"road": 5.4, "rail": 5.9, "ped": 4.6}[kind]
    wmin = {"road": 6.6, "rail": 8.6, "ped": 5.6}[kind]
    if "Kingston" in name: wmin = 17.5
    if "Clyde Arc" in name or "Squinty" in name: wmin = 8.2
    f = (S - s0) / max(Ltot, 1e-6)
    lerp = g0 + (g1 - g0) * f + 0.4
    need = np.where(wat, np.maximum(wmin, lerp), gmax + clr)
    if Ltot < 80 and not wat.any():
        zl = max(g0, g1) + 0.4; zl = max(zl, min(float(need.max()), max(g0, g1) + 5.0)); z = np.full(len(S), zl)
    else:
        z = np.maximum(lerp, need)
        slope = 0.045 if kind == "rail" else 0.06
        for i in range(1, len(z)): z[i] = max(z[i], z[i - 1] - slope * 2.0)
        for i in range(len(z) - 2, -1, -1): z[i] = max(z[i], z[i + 1] - slope * 2.0)
        z = _smooth(z, 2)
        if wat.any() and Ltot > 100: z = z + 1.2 * np.sin(np.pi * f)
    if c.get('debug'): print('Z', name, np.round(S[::10]), np.round(z[::10],1), 'g', np.round(gmax[::10],1), 'wat', wat[::10].astype(int), g0, g1)
    zfun = lambda x, y: np.interp((x - cx) * ax + (y - cy) * ay, S, z)
    struct = c["struct"] or ("beam")
    over_w = bool(wat.any())
    # span layout
    span = {"arch": 26.0, "beam": 36.0 if kind != "road" else 42.0, "suspension": 60.0, "cable-stayed": 60.0}.get(struct, 36.0)
    if "Kingston" in name: span = 58.0
    nsp = max(1, int(round(Ltot / span))); pier_s = [s0 + Ltot * k / nsp for k in range(nsp + 1)]
    zmean = float(z.mean()); rise = min(0.22 * Ltot / nsp, max(zmean - 1.0 - float(gmin.min()) - 1.2, 0.0)) if struct == "arch" else 0.0
    depth = {"rail": 2.2, "road": 1.4, "ped": 0.55}[kind]
    if "Kingston" in name: depth = 3.4
    def zbot_arr(x, y):
        zz = zfun(x, y)
        if struct == "arch" and rise > 0.4:
            s = (x - cx) * ax + (y - cy) * ay
            k = np.clip(np.floor((s - s0) / (Ltot / nsp)).astype(int), 0, nsp - 1); t = (s - s0 - k * Ltot / nsp) / (Ltot / nsp)
            return zz - 1.0 - rise * (1 - np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)))
        return zz - depth
    # ---- colours
    if struct == "arch": fcol = lin(STONE_C); pcol = lin(STONE_C) * 1.05
    elif kind == "rail": fcol = lin(STEEL_C); pcol = lin(STEEL_C) * 1.25
    elif kind == "ped": fcol = lin((0.55, 0.57, 0.60)); pcol = lin((0.7, 0.72, 0.75))
    else: fcol = lin(CONC_C); pcol = lin(CONC_C) * 1.1
    topc = {"road": lin((0.17, 0.17, 0.18)), "rail": lin((0.28, 0.27, 0.26)), "ped": lin((0.50, 0.48, 0.45))}[kind]
    ph = {"rail": 0.9, "road": 1.0, "ped": 1.1}[kind]
    if kind == "rail" and struct != "arch": ph = 1.0
    # ---- deck top
    tri_n = 0
    B = Brail if kind == "rail" else Bdeck
    r = tri_polygon(P, 160, 8.0)
    if r is not None:
        V, T = r; Pt = np.c_[V, zfun(V[:, 0], V[:, 1])]; B.add(Pt, flip_up(Pt, np.asarray(T, np.int64)), topc, None, 0); tri_n += len(T)
    # ---- underside
    r = tri_polygon(P, 220, 8.0)
    if r is not None:
        V, T = r; Pt = np.c_[V, zbot_arr(V[:, 0], V[:, 1])]; Tn = flip_up(Pt, np.asarray(T, np.int64))[:, [0, 2, 1]]
        Bstruct.add(Pt, Tn, lin(DARK_C) * 1.3, None, 0)
    # ---- fascia / parapets
    def ring_wall(ring, rev, ztop_off, bottom_fn, col, end_clip=False, seg=4.0):
        co = [tuple(q) for q in ring.coords]
        co = densify_ring(co, seg)
        pts = np.array(co)
        if rev: pts = pts[::-1]
        for k in range(len(pts) - 1):
            a, b = pts[k], pts[k + 1]
            if math.hypot(*(b - a)) < 0.05: continue
            za = float(zfun(a[0], a[1])); zb = float(zfun(b[0], b[1]))
            ba = float(bottom_fn(a[0], a[1])) if bottom_fn else za; bb = float(bottom_fn(b[0], b[1])) if bottom_fn else zb
            if bottom_fn is not None and end_clip:
                sa = (a[0] - cx) * ax + (a[1] - cy) * ay; sb = (b[0] - cx) * ax + (b[1] - cy) * ay
                if min(sa, sb) < s0 + 3 or max(sa, sb) > s1 - 3:
                    ba = min(ba, float(TR.h(a[0], a[1], 1)) - 0.4); bb = min(bb, float(TR.h(b[0], b[1], 1)) - 0.4)
            Pq = [(a[0], a[1], ba), (b[0], b[1], bb), (b[0], b[1], zb + ztop_off), (a[0], a[1], za + ztop_off)]
            Bstruct.add(Pq, [[0, 1, 2], [0, 2, 3]], col, None, 0)
    for ring in [P.exterior] + list(P.interiors):
        ring_wall(ring, False, ph if ring is P.exterior or True else 0, zbot_arr, fcol, True)
    P2 = P.buffer(-0.35, join_style=2)
    for q in polys_of(P2):
        q = orient(q, 1.0)
        for ring in [q.exterior] + list(q.interiors):
            ring_wall(ring, True, ph, None, fcol * 0.9)    # inner face of the parapet (from deck level up)
    # parapet top strip
    try:
        strip = P.difference(P2)
        for q in polys_of(strip):
            if q.area < 0.5: continue
            V, T = earcut_poly(q); Pt = np.c_[V, zfun(V[:, 0], V[:, 1]) + ph]; Bstruct.add(Pt, flip_up(Pt, T.astype(np.int64)), pcol, None, 0)
    except Exception: pass
    # ---- piers
    if Ltot > 40:
        for sp in pier_s[1:-1]:
            xs = cx + ax * sp + nx_ * np.linspace(u0 - 1, u1 + 1, 60); ys = cy + ay * sp + ny_ * np.linspace(u0 - 1, u1 + 1, 60)
            ins = shapely.contains_xy(P.buffer(0.3), xs, ys)
            if not ins.any(): continue
            ia = np.where(ins)[0]; a_i, b_i = ia[0], ia[-1]
            A = np.array([xs[a_i], ys[a_i]]); Bq = np.array([xs[b_i], ys[b_i]])
            th = 3.0 if kind == "rail" else (4.2 if "Kingston" not in name else 5.0)
            wide = float(np.hypot(*(Bq - A)))
            cols = [(0.0, 1.0)] if wide < 26 else [(q / max(int(wide // 13), 1), (q + 0.42) / max(int(wide // 13), 1)) for q in range(int(wide // 13) + 1)]
            if ("Kingston" not in name and kind != "road" and wide >= 26) or struct == "arch": cols = [(0.0, 1.0)]
            for ta, tb in cols:
                pa = A + (Bq - A) * ta; pb = A + (Bq - A) * min(tb, 1.0)
                if np.hypot(*(pb - pa)) < 0.5: continue
                mx, my = (pa + pb) / 2
                zs = float(zbot_arr(np.array([cx + ax * sp]), np.array([cy + ay * sp]))[0]) if struct != "arch" else float(zfun(cx + ax * sp, cy + ay * sp)) - 1.0 - rise
                gb = float(TR.h(pa[0], pa[1], 1)) - 0.6
                if gb > zs - 0.3: continue
                d = np.array([ax, ay]) * th / 2
                ring = [tuple(pa - d), tuple(pa + d), tuple(pb + d), tuple(pb - d)]
                prism(Bstruct, ring, gb, zs + 0.2, fcol * 0.85 if struct != "arch" else lin(STONE_C) * 0.9, 0, cap=False)
    # ---- rails
    if kind == "rail":
        for g, t, i in c["lines"]:
            rb = ribbon(np.asarray(g.coords), 1.5, 6.0)
            if rb is None: continue
            Lf, Rf, Cc, s = rb; n = len(s); zz = zfun(Cc[:, 0], Cc[:, 1]) + 0.14
            for E in (Lf, Rf):
                d = Cc - E; d /= (np.linalg.norm(d, axis=1, keepdims=True) + 1e-9); E2 = E + d * 0.16
                Pq = np.concatenate([np.c_[E, zz], np.c_[E2, zz]]); tri = []
                for k in range(n - 1): tri += [[k, n + k, n + k + 1], [k, n + k + 1, k + 1]]
                Brails.add(Pq, flip_up(Pq, np.array(tri)), lin((0.55, 0.55, 0.58)), None, 0)
    else:
        # centre line marking for road decks (thin)
        pass
    # ---- footbridge towers / cables
    if kind == "ped" and struct in ("suspension", "cable-stayed") and Ltot > 40:
        wmid = (u0 + u1) / 2
        def pt(s, u, zz): return (cx + ax * s + nx_ * u, cy + ay * s + ny_ * u, zz)
        steel = lin((0.75, 0.77, 0.80))
        if struct == "suspension":
            for sT in (s0 + 0.12 * Ltot, s1 - 0.12 * Ltot):
                zt = float(zfun(cx + ax * sT, cy + ay * sT))
                for u in (u0 + 0.5, u1 - 0.5): beam(Bstruct, pt(sT, u, zt - 3), pt(sT, u, zt + 14), 0.7, steel)
                beam(Bstruct, pt(sT, u0 + 0.5, zt + 13), pt(sT, u1 - 0.5, zt + 13), 0.5, steel)
            sa, sb = s0 + 0.12 * Ltot, s1 - 0.12 * Ltot; za = float(zfun(cx + ax * sa, cy + ay * sa)) + 14; zb = float(zfun(cx + ax * sb, cy + ay * sb)) + 14
            for u in (u0 + 0.5, u1 - 0.5):
                prev = None
                for q in range(0, 21):
                    s = sa + (sb - sa) * q / 20; zc = za + (zb - za) * q / 20 - 9.5 * 4 * (q / 20) * (1 - q / 20)
                    p = pt(s, u, zc)
                    if prev: beam(Bstruct, prev, p, 0.18, steel)
                    if 0 < q < 20 and q % 1 == 0: beam(Bstruct, p, pt(s, u, float(zfun(cx + ax * s, cy + ay * s)) + 1.0), 0.06, steel)
                    prev = p
        else:
            sm = s0 + 0.35 * Ltot; zt = float(zfun(cx + ax * sm, cy + ay * sm)); um = u1 - 0.8
            beam(Bstruct, pt(sm, um, zt), pt(sm, um, zt + 20), 0.9, steel)
            for q in range(1, 9):
                for sgn in (-1, 1):
                    s = sm + sgn * q * 0.07 * Ltot
                    if s0 + 1 < s < s1 - 1: beam(Bstruct, pt(sm, um, zt + 19.5), pt(s, wmid, float(zfun(cx + ax * s, cy + ay * s)) + 0.5), 0.05, steel)
    # ---- Clyde Arc: steel arch with hangers
    if "Clyde Arc" in name or "Squinty" in name:
        steel = lin((0.72, 0.74, 0.77)); off = u1 - (u1 - u0) * 0.5 + 6.0
        pts = []
        for q in range(0, 25):
            f_ = q / 24; s = s0 + Ltot * f_; zt = float(zfun(cx + ax * s, cy + ay * s))
            pts.append((cx + ax * s + nx_ * off, cy + ay * s + ny_ * off, zt + 34 * math.sin(math.pi * f_) ** 0.85))
        for q in range(24): beam(Bstruct, pts[q], pts[q + 1], 1.7, steel)
        for q in range(1, 24):
            f_ = q / 24; s = s0 + Ltot * f_; zt = float(zfun(cx + ax * s, cy + ay * s))
            beam(Bstruct, (pts[q][0], pts[q][1], pts[q][2]), (cx + ax * s + nx_ * (u1 - 1.2), cy + ay * s + ny_ * (u1 - 1.2), zt + 0.8), 0.22, steel)
    return tri_n

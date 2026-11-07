#!/usr/bin/env python3
"""people_skinfit.py - tuck the skin that pokes out through the clothes of models/people.glb and models/people_lod.glb back underneath them.

Why: tools/assets_people_mpfb.py decimates every garment hard (a T-shirt ends up with ~340 triangles, the body with ~4400) and masks the body away under
the clothes, but the masks stop at the garment's borders, so shoulder, armpit, upper back and ankle strips of body skin are left lying right under the cloth.
A low-poly shirt cannot follow the curve of those strips: the skin shows through as skin-coloured slits and patches ("holes in the T-shirt"); under a kilt the
hose are a few big triangles and the calves and knees show through them.

What it does (rest pose, after the Blender export; numpy only):
  * every body triangle that has points on the OUTSIDE of a garment, away from the garment's hems (neck, sleeve and trouser openings are open edges: bare
    skin is supposed to show there), and whose bone weights overlap the garment's (a forearm swinging past a shirt's side is bare skin, not "under" it),
    is fixed by moving its garment-side vertices inwards, along the garment's normal, until every sampled point of the triangle lies `margin` inside;
  * the vertices that cannot move (head, neck, hands, anything near a hem, anything with other bone weights than the garment) stay exactly where they were;
  * footwear is not a garment here: the collar of a high-top is an open edge and pushing the ankle under it only drags slivers of skin over the tongue;
  * only POSITION data of the skin primitive is rewritten (a few hundred vertices, millimetres to a few centimetres, always inwards), so the bones,
    weights, UVs, normals, other primitives and file layout are byte-identical; each repaired person gets `extras.skinfit` on its mesh node so a second run
    leaves it alone (the push limit would otherwise apply afresh each time) and `--check` can tell.

WHO is repaired is decided by RECIPE below, not by the tool: the repair was measured, person by person, in the game's own pipeline (AnimCrowd, stand + two
walk phases, eight azimuths, area of body skin drawn in front of a garment's surface) and it is applied only where it made that area clearly smaller. Where it
did not (a hoodie whose cuffs grew slivers, a jacket whose armpit opened up) the skin stays as the pipeline exported it. Re-measure before changing the list
(models/MODELS.md, "Skin under garments", says how); `--all` ignores the list, for such experiments.

Run it AFTER the pipeline:

    python3 tools/people_skinfit.py --check                 # report only; exit 1 if a listed person has not been repaired yet
    python3 tools/people_skinfit.py --write                 # repair models/people.glb and models/people_lod.glb in place
    python3 tools/people_skinfit.py --write --all --only teen_boy --out /tmp/x.glb models/people.glb     # an experiment: any person, any file, elsewhere

js/sim/sim.test.mjs checks the committed files with a separate implementation (js/sim/skincheck.mjs: JavaScript, its own sampling, ray test and hem test)
and fails if a listed person is not repaired or a regenerated file shows more skin than the budgets recorded there.
"""
import argparse, json, os, struct, sys, time
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', 'models')
CLOTH = ('cloth_', 'hose_', 'belt', 'sporran')
# who is repaired, and how hard (the most a vertex may move in one pass, metres; 1.5x that in all). Measured, see the docstring.
RECIPE = {
    'man_student': 0.03, 'man_kilt_casual': 0.03, 'boy_kilt': 0.03, 'girl_school_kilt': 0.03,     # sweater torso and kilt hose: big gaps, big pushes
    'woman_midi': 0.015, 'man_commuter': 0.015, 'man_trews': 0.015, 'teen_boy': 0.015,   # shoulders, upper back, thighs: a centimetre or two
    'teen_hood': 0.03,                                                                    # hoodie torso (2026-11-07: holes LOD 24.1 -> 12.7 cm2/view)
    # A tube top leaves the waistband of the jeans on show, and the skin comes through right at that open edge, inside the usual 15 mm hem margin.
    # A (push, hem) pair repairs closer to the edge (2026-11-07, tools/people_holes.mjs full model: ya_tube_heels 34.6 -> 13.4 cm2/view; with the
    # usual margin it got worse, 37.2). Tried and dropped: a tube top over denim shorts (102 cm2/view, and the repair raised the rest-pose count).
    'ya_tube_heels': (0.03, 0.005),
}
DEFAULT_PUSH = 0.03
MARK = 'skinfit'
FOOTWEAR = ('cloth_boots', 'cloth_shoes', 'cloth_sneaker')   # skin is NOT tucked into shoes: the collar of a high-top is an open edge, and pushing the ankle in drags thin slivers of skin over the tongue


# ------------------------------------------------------------------ minimal GLB access
class Glb:
    def __init__(self, path):
        self.path = path
        d = open(path, 'rb').read()
        assert d[:4] == b'glTF', path
        off, self.j, self.bin = 12, None, b''
        while off < len(d):
            n, t = struct.unpack_from('<II', d, off)
            chunk = d[off + 8:off + 8 + n]; off += 8 + n
            if t == 0x4E4F534A: self.j = json.loads(chunk)
            elif t == 0x004E4942: self.bin = bytearray(chunk)

    def acc(self, i):
        a = self.j['accessors'][i]; bv = self.j['bufferViews'][a['bufferView']]
        dt = np.dtype(CT[a['componentType']]); nc = NC[a['type']]; n = a['count']
        base = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride') or dt.itemsize * nc
        buf = np.frombuffer(self.bin, np.uint8, count=stride * (n - 1) + dt.itemsize * nc, offset=base)
        arr = np.lib.stride_tricks.as_strided(buf, shape=(n, dt.itemsize * nc), strides=(stride, 1)).copy().view(dt).reshape(n, nc)
        if a.get('normalized'):
            arr = arr.astype(np.float32)
            if dt == np.uint8: arr = arr / 255.0
            elif dt == np.uint16: arr = arr / 65535.0
        return arr[:, 0] if nc == 1 else arr

    def set_positions(self, i, P):
        a = self.j['accessors'][i]; bv = self.j['bufferViews'][a['bufferView']]
        assert a['componentType'] == 5126 and a['type'] == 'VEC3'
        base = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride') or 12
        P = np.asarray(P, np.float32)
        for k in range(len(P)): self.bin[base + k * stride:base + k * stride + 12] = P[k].tobytes()
        a['min'] = [float(x) for x in P.min(0)]; a['max'] = [float(x) for x in P.max(0)]

    def save(self, path):
        js = json.dumps(self.j, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4); bn = bytes(self.bin); bn += b'\0' * (-len(bn) % 4)
        out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(bn)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bn), 0x004E4942) + bn
        open(path, 'wb').write(out)

    def person_ids(self):
        return sorted(n['name'][len('person_'):-len('_mesh')] for n in self.j['nodes'] if n.get('name', '').startswith('person_') and n['name'].endswith('_mesh'))

    def node_of(self, pid):
        return next(n for n in self.j['nodes'] if n.get('name') == f'person_{pid}_mesh')

    def mark(self, pid):
        """-> what a previous repair recorded on this person's mesh node (or None)"""
        return (self.node_of(pid).get('extras') or {}).get(MARK)

    def set_mark(self, pid, info):
        self.node_of(pid).setdefault('extras', {})[MARK] = info

    def mesh_prims(self, pid):
        node = self.node_of(pid)
        skin = self.j['skins'][node['skin']]; nj = len(skin['joints'])
        out = []
        for p in self.j['meshes'][node['mesh']]['primitives']:
            at = p['attributes']; mat = self.j['materials'][p['material']].get('name') or ''
            out.append(dict(mat=mat, pos_acc=at['POSITION'], P=self.acc(at['POSITION']).astype(np.float64), I=self.acc(p['indices']).astype(np.int64).reshape(-1, 3),
                            J=self.acc(at['JOINTS_0']).astype(np.int64) if 'JOINTS_0' in at else None, W=self.acc(at['WEIGHTS_0']).astype(np.float64) if 'WEIGHTS_0' in at else None))
        return out, nj


# ------------------------------------------------------------------ geometry
def weld(P, tol=1e-4):
    key = np.round(P / tol).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    return inv.reshape(-1)


def dense_weights(J, W, nj):
    D = np.zeros((len(J), nj))
    for k in range(4): np.add.at(D, (np.arange(len(J)), J[:, k]), W[:, k])
    return D


def closest_pairs(p, A, B, C):
    """Ericson's closest point on a triangle, for matching rows: p, A, B, C (N,3) -> (N,3)"""
    ab, ac, ap = B - A, C - A, p - A
    d1, d2 = (ab * ap).sum(1), (ac * ap).sum(1)
    bp = p - B; d3, d4 = (ab * bp).sum(1), (ac * bp).sum(1)
    cp = p - C; d5, d6 = (ab * cp).sum(1), (ac * cp).sum(1)
    vc, vb, va = d1 * d4 - d3 * d2, d5 * d2 - d1 * d6, d3 * d6 - d5 * d4
    with np.errstate(all='ignore'):
        den = va + vb + vc
        q = A + ab * (vb / den)[:, None] + ac * (vc / den)[:, None]
        wbc = (d4 - d3) / ((d4 - d3) + (d5 - d6)); wac = d2 / (d2 - d6); vab = d1 / (d1 - d3)
    def put(m, v): q[m] = v[m]
    put((va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0), B + (C - B) * wbc[:, None])
    put((vb <= 0) & (d2 >= 0) & (d6 <= 0), A + ac * wac[:, None])
    put((vc <= 0) & (d1 >= 0) & (d3 <= 0), A + ab * vab[:, None])
    put((d6 >= 0) & (d5 <= d6), C)
    put((d3 >= 0) & (d4 <= d3), B)
    put((d1 <= 0) & (d2 <= 0), A)
    return q


class Soup:
    """the garments of one person as one triangle soup: nearest-surface queries, hem (open edge) distances, bone weights"""
    def __init__(self, prims, nj):
        P, I, W, off = [], [], [], 0
        for m in prims:
            if not m['mat'].startswith(CLOTH) or m['mat'].lower().startswith(FOOTWEAR): continue
            P.append(m['P']); I.append(m['I'] + off); W.append(dense_weights(m['J'], m['W'], nj)); off += len(m['P'])
        self.empty = not P
        if self.empty: return
        self.P, self.I, self.W = np.concatenate(P), np.concatenate(I), np.concatenate(W)
        self.A, self.B, self.C = self.P[self.I[:, 0]], self.P[self.I[:, 1]], self.P[self.I[:, 2]]
        n = np.cross(self.B - self.A, self.C - self.A); self.N = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        self.TW = (self.W[self.I[:, 0]] + self.W[self.I[:, 1]] + self.W[self.I[:, 2]]) / 3
        self.lo = np.minimum(np.minimum(self.A, self.B), self.C); self.hi = np.maximum(np.maximum(self.A, self.B), self.C)
        w = weld(self.P); t = w[self.I]
        e = np.sort(np.concatenate([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]]), axis=1)
        key = e[:, 0].astype(np.int64) * (w.max() + 1) + e[:, 1]
        _, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
        rep = np.zeros(w.max() + 1, np.int64); rep[w] = np.arange(len(w)); be = e[(cnt[inv] == 1)]
        self.HA, self.HB = self.P[rep[be[:, 0]]], self.P[rep[be[:, 1]]]

    def nearest(self, X, reach):
        """-> dm (inf when nothing within reach), tri index, closest point, signed distance (+ = outside the garment)"""
        n = len(X); dm = np.full(n, np.inf); jj = np.full(n, -1); qq = np.zeros((n, 3)); sd = np.zeros(n)
        for s in range(0, n, 1500):
            x = X[s:s + 1500]
            m = ((x[:, None, :] >= self.lo[None] - reach) & (x[:, None, :] <= self.hi[None] + reach)).all(-1)
            i, j = np.nonzero(m)
            if not len(i): continue
            q = closest_pairs(x[i], self.A[j], self.B[j], self.C[j]); d = np.linalg.norm(q - x[i], axis=1)
            order = np.lexsort((d, i)); i, j, q, d = i[order], j[order], q[order], d[order]
            first = np.concatenate([[True], i[1:] != i[:-1]]); i, j, q, d = i[first], j[first], q[first], d[first]
            dm[s + i] = d; jj[s + i] = j; qq[s + i] = q; sd[s + i] = ((x[i] - q) * self.N[j]).sum(1)
        return dm, jj, qq, sd

    def covered(self, X, D, tmin=0.002, tmax=0.08):
        """True where the ray from X along D meets any garment within tmax (a second layer above it, or a crease between two garment parts): the point cannot be seen from outside"""
        out = np.zeros(len(X), bool)
        if not len(X): return out
        e1, e2 = self.B - self.A, self.C - self.A
        for s in range(0, len(X), 300):
            o, d = X[s:s + 300, None, :], D[s:s + 300, None, :]
            pv = np.cross(d, e2[None]); det = (e1[None] * pv).sum(-1)
            with np.errstate(all='ignore'):
                inv = 1.0 / det; tv = o - self.A[None]; u = (tv * pv).sum(-1) * inv
                qv = np.cross(tv, e1[None]); v = (d * qv).sum(-1) * inv; t = (e2[None] * qv).sum(-1) * inv
            hit = (u >= 0) & (v >= 0) & (u + v <= 1) & (t > tmin) & (t < tmax) & (np.abs(det) > 1e-12)
            out[s:s + 300] = hit.any(1)
        return out

    def hem_dist(self, Q):
        out = np.full(len(Q), np.inf)
        if not len(Q) or not len(self.HA): return out
        ab = self.HB - self.HA; l2 = (ab * ab).sum(1) + 1e-18
        for s in range(0, len(Q), 2000):
            q = Q[s:s + 2000, None, :]; t = np.clip(((q - self.HA[None]) * ab[None]).sum(-1) / l2[None], 0, 1)
            out[s:s + 2000] = np.linalg.norm(q - (self.HA[None] + ab[None] * t[..., None]), axis=-1).min(1)
        return out


def bary_grid(n):
    return np.array([(i / n, j / n, (n - i - j) / n) for i in range(n + 1) for j in range(n + 1 - i)])


def offenders(soup, X, WX, reach, hem, overlap_min, clear):
    """X (N,3) points on the body, WX (N,nJ) their bone weights -> dict of the points that show skin through a garment"""
    dm, j, q, sd = soup.nearest(X, reach)
    cand = np.where(np.isfinite(dm) & (sd > -clear))[0]
    ok = np.zeros(len(X), bool); db = np.full(len(X), np.inf)
    if len(cand):
        db[cand] = soup.hem_dist(q[cand])
        ov = np.minimum(WX[cand], soup.TW[j[cand]]).sum(1)
        ok[cand] = (db[cand] > hem) & (ov >= overlap_min)
        keep = np.where(ok)[0]
        if len(keep): ok[keep[soup.covered(X[keep], soup.N[j[keep]])]] = False   # visible poke only: open air in front of it, not hidden under a second garment or in a crease
    return dict(dm=dm, j=j, q=q, sd=sd, bad=ok)


def movable_vertices(soup, U, WU, reach, hem, overlap_min):
    """-> movable mask, and each vertex's inward direction (minus the normal of the garment face nearest to it)"""
    dm, j, q, sd = soup.nearest(U, reach)
    mv = np.zeros(len(U), bool); near = np.where(np.isfinite(dm))[0]
    if len(near):
        db = soup.hem_dist(q[near]); ov = np.minimum(WU[near], soup.TW[j[near]]).sum(1); mv[near] = (db > hem) & (ov >= overlap_min)
    nd = np.zeros((len(U), 3)); ok = j >= 0; nd[ok] = -soup.N[j[ok]]
    return mv, nd


def solve_pushes(tv, bw, mv, nd, Ns, r, cap, sweeps=80):
    """Smallest inward vertex shifts (Kaczmarz sweeps on the inequalities  sum_i w_i * <nd_i, -N_s> * delta_i >= r_s,  0 <= delta <= cap)."""
    A = bw * mv[tv] * np.clip((nd[tv] * (-Ns)[:, None, :]).sum(2), 0, 1)
    n2 = (A * A).sum(1); live = np.where(n2 > 1e-4)[0]
    delta = np.zeros(len(mv))
    for _ in range(sweeps):
        worst = 0.0
        for s in live:
            v = tv[s]; cur = (A[s] * delta[v]).sum()
            if cur >= r[s]: continue
            delta[v] = np.minimum(cap, delta[v] + (r[s] - cur) / n2[s] * A[s]); worst = max(worst, r[s] - cur)
        if worst < 2e-4: break
    return delta


# ------------------------------------------------------------------ the fit
def sample_tris(U, WU, TU, tri, grid, nj):
    P = (U[TU[tri]][:, None, :, :] * grid[None, :, :, None]).sum(2).reshape(-1, 3)
    W = (WU[TU[tri]][:, None, :, :] * grid[None, :, :, None]).sum(2).reshape(-1, nj)
    return P, W


def fit_person(glb, pid, margin=0.004, clear=0.001, reach=0.035, hem=0.015, overlap_min=0.35, iters=6, nsub=5, maxpush=0.03, verbose=False):   # (each pass moves a vertex at most maxpush, never more than 1.5 x maxpush in all)
    prims, nj = glb.mesh_prims(pid)
    soup = Soup(prims, nj)
    res = dict(id=pid, moved=0, max=0.0, before=0, after=0, worst_before=0.0, worst_after=0.0, edits=[])
    if soup.empty: return res
    for sk in [m for m in prims if m['mat'].startswith('skin_')]:
        S0, T0 = sk['P'], sk['I']
        w = weld(S0); nu = w.max() + 1
        U = np.zeros((nu, 3)); U[w] = S0
        WU = np.zeros((nu, nj)); WU[w] = dense_weights(sk['J'], sk['W'], nj)
        TU = w[T0]; TU = TU[(TU[:, 0] != TU[:, 1]) & (TU[:, 1] != TU[:, 2]) & (TU[:, 0] != TU[:, 2])]
        grid = bary_grid(nsub); U0 = U.copy(); total = np.zeros(nu)
        for it in range(iters):
            mv, nd = movable_vertices(soup, U, WU, reach, hem, overlap_min)
            tri = np.where(mv[TU].any(1))[0]
            if not len(tri): break
            Pt, Wt = sample_tris(U, WU, TU, tri, grid, nj)
            off = offenders(soup, Pt, Wt, reach, hem, overlap_min, clear)
            bad = np.where(off['bad'])[0]
            if it == 0: res['before'] = len(bad); res['worst_before'] = float(off['sd'][bad].max()) if len(bad) else 0.0
            if not len(bad): break
            tv = TU[tri[bad // len(grid)]]; bw = grid[bad % len(grid)]
            delta = solve_pushes(tv, bw, mv, nd, soup.N[off['j'][bad]], np.clip(off['sd'][bad] + margin, 0, None), maxpush)
            delta = np.minimum(delta, np.maximum(0, maxpush * 1.5 - total)); total += delta   # never more than 4.5 cm in all
            idx = np.where(delta > 0)[0]
            if not len(idx): break
            U[idx] += nd[idx] * delta[idx, None]
            if verbose: print(f'    {pid} pass {it}: {len(bad)} bad samples, moved {len(idx)} vertices, max {delta.max()*1000:.1f} mm')
        # final measurement with a denser grid
        g2 = bary_grid(8); mv, _ = movable_vertices(soup, U, WU, reach, hem, overlap_min); tri = np.where(mv[TU].any(1))[0]
        if len(tri):
            Pt, Wt = sample_tris(U, WU, TU, tri, g2, nj)
            off = offenders(soup, Pt, Wt, reach, hem, overlap_min, clear); bad = np.where(off['bad'])[0]
            res['after'] = int(len(bad)); res['worst_after'] = float(off['sd'][bad].max()) if len(bad) else 0.0
        mvd = np.linalg.norm(U - U0, axis=1); res['moved'] += int((mvd > 1e-5).sum()); res['max'] = max(res['max'], float(mvd.max()))
        res['edits'].append((sk['pos_acc'], (U[w]).astype(np.float32)))
    return res


_JOB = {}


def _push(pid):
    r = RECIPE.get(pid, DEFAULT_PUSH)
    return _JOB['maxpush'] if _JOB['maxpush'] is not None else (r[0] if isinstance(r, tuple) else r)

DEFAULT_HEM = 0.015
def _hem(pid):   # --hem if given, else a RECIPE (push, hem) pair's margin, else DEFAULT_HEM
    r = RECIPE.get(pid)
    return _JOB['hem'] if _JOB['hem'] is not None else (r[1] if isinstance(r, tuple) else DEFAULT_HEM)


def _job(pid):
    return pid, fit_person(_JOB['glb'], pid, margin=_JOB['margin'], maxpush=_push(pid), hem=_hem(pid), verbose=_JOB['verbose'])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('files', nargs='*', help='GLBs (default: models/people.glb models/people_lod.glb)')
    ap.add_argument('--write', action='store_true', help='rewrite the GLBs in place')
    ap.add_argument('--check', action='store_true', help='report only (nothing is fitted); exit 1 if a person in RECIPE has not been repaired yet')
    ap.add_argument('--only', default='', help='comma list of person ids')
    ap.add_argument('--verbose', action='store_true')
    ap.add_argument('--out', default='', help='with --write and a single input file: write there instead of in place')
    ap.add_argument('--margin', type=float, default=0.004)
    ap.add_argument('--maxpush', type=float, default=None, help='most a vertex moves in one pass (m), 1.5x that in all (default: the RECIPE value of each person, else %g)' % DEFAULT_PUSH)
    ap.add_argument('--all', action='store_true', help='repair everybody, not just the people in RECIPE (an experiment: the others got worse or no better when measured)')
    ap.add_argument('--force', action='store_true', help='repair people already marked as repaired (their push limit applies afresh: the skin moves again)')
    ap.add_argument('--hem', type=float, default=None, help='leave alone everything this close to an open edge of a garment (neck, cuff, hem) (m; default: the RECIPE value of each person, else 0.015)')
    ap.add_argument('--jobs', type=int, default=1, help='fit this many people in parallel (fork)')
    a = ap.parse_args()
    files = a.files or [os.path.join(MODELS, 'people.glb'), os.path.join(MODELS, 'people_lod.glb')]
    only = [s for s in a.only.split(',') if s]
    todo = 0
    for f in files:
        if not os.path.exists(f): print('skip (missing):', f); continue
        glb = Glb(f); t0 = time.time(); changed = 0
        print(f'{os.path.basename(f)}: {len(glb.person_ids())} people')
        ids = [p for p in glb.person_ids() if (not only or p in only) and (a.all or p in RECIPE)]
        done = [p for p in ids if glb.mark(p) and not a.force]
        for p in done: print(f"  {p:16s} already repaired (maxpush {glb.mark(p).get('maxpush')}); left alone")
        ids = [p for p in ids if p not in done]
        if a.check and not a.write:
            for p in ids: print(f'  {p:16s} NOT repaired yet')
            todo += len(ids); continue
        _JOB['glb'], _JOB['margin'], _JOB['maxpush'], _JOB['hem'], _JOB['verbose'] = glb, a.margin, a.maxpush, a.hem, a.verbose
        if a.jobs > 1 and len(ids) > 1:
            import multiprocessing as mp
            pool = mp.get_context('fork').Pool(a.jobs); results = pool.imap(_job, ids)   # imap keeps the order; fork shares the parsed GLB
        else:
            pool = None; results = map(_job, ids)
        for pid, r in results:
            todo += 1
            if a.write:
                for acc, P in r['edits']: glb.set_positions(acc, P)
                glb.set_mark(pid, {'v': 1, 'maxpush': _push(pid), 'moved': r['moved']}); changed += 1
            print(f"  {pid:16s} maxpush {_push(pid)*1000:4.1f} mm: samples showing skin through cloth {r['before']:4d} (worst {r['worst_before']*1000:5.1f} mm) -> {r['after']:3d} (worst {r['worst_after']*1000:5.1f} mm; the two counts use different sample densities); moved {r['moved']:4d} vertices, max {r['max']*1000:5.1f} mm", flush=True)
        if pool: pool.close(); pool.join()
        if a.write and changed:
            dst = a.out or f; glb.save(dst); print(f'  wrote {dst} ({changed} people repaired) in {time.time()-t0:.0f}s')
    if a.check and todo:
        print(f'{todo} listed people have not been repaired yet: run  python3 tools/people_skinfit.py --write'); sys.exit(1)


if __name__ == '__main__':
    main()

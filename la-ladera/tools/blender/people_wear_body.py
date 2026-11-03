"""Closed optional bodies derived from the current resident authoring sources.

Native exposed hand, leg and sandal-skin coordinates are retained. The current
source does not contain an unclothed torso or complete upper arm: those covered
regions use its current torso contours and latent arm profile. Only hidden open
boundaries are capped for the independently checked closed-surface contract.
"""
from __future__ import annotations

import ast
import copy
from collections import defaultdict, deque
from functools import lru_cache
import hashlib
import math
from pathlib import Path

import numpy as np

import people_body as native_body
import people_body_limbs as native_limbs

HERE = Path(__file__).resolve().parent


def source_sha(path):
    """Text provenance uses LF bytes on both LF and core.autocrlf checkouts."""
    return hashlib.sha256(Path(path).read_bytes().replace(b'\r\n', b'\n')).hexdigest()


@lru_cache(maxsize=1)
def _source_functions():
    # Execute only pure recipe expressions, never the scene-building module.
    build = ast.parse((HERE / 'people_build.py').read_text())
    crv = next(n for n in build.body if isinstance(n, ast.FunctionDef) and n.name == 'crv')
    arms = ast.parse((HERE / 'people_body_limbs.py').read_text())
    arms = next(n for n in arms.body if isinstance(n, ast.FunctionDef) and n.name == 'append_arms')
    outer = next(n for n in arms.body if isinstance(n, ast.For))
    prefix = copy.deepcopy(arms.body[:arms.body.index(outer)])
    for statement in outer.body:
        prefix.append(copy.deepcopy(statement))
        if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'profile' for t in statement.targets):
            break
    else:
        raise RuntimeError('Current append_arms has no native profile assignment')
    prefix.append(ast.Return(value=ast.Name(id='profile', ctx=ast.Load())))
    args = ast.arguments(posonlyargs=[], args=[ast.arg(arg=n) for n in ('P', 'pd', 'sg')], kwonlyargs=[], kw_defaults=[], defaults=[])
    profile = ast.FunctionDef(name='arm_profile', args=args, body=prefix, decorator_list=[])
    body_tree = ast.parse((HERE / 'people_body.py').read_text())
    leg = next(n for n in body_tree.body if isinstance(n, ast.FunctionDef) and n.name == '_bare_leg')
    leg_prefix = []
    for statement in leg.body:
        leg_prefix.append(copy.deepcopy(statement))
        if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'specs' for t in statement.targets):
            break
    else:
        raise RuntimeError('Current _bare_leg has no native profile assignment')
    leg_prefix.append(ast.Return(value=ast.Name(id='specs', ctx=ast.Load())))
    leg_fn = ast.FunctionDef(name='leg_profile', args=copy.deepcopy(leg.args), body=leg_prefix, decorator_list=[])
    module = ast.fix_missing_locations(ast.Module(body=[copy.deepcopy(crv), profile, leg_fn], type_ignores=[]))
    env = {'math': math, 'SKIN': native_limbs.SKIN}
    exec(compile(module, '<current people body recipes>', 'exec'), env)
    return env['crv'], env['arm_profile'], env['leg_profile']


def arm_profile(P, pd, sg=1):
    return _source_functions()[1](P, pd, sg)


def leg_profile(P, pd, sg=1):
    return _source_functions()[2](None, P, pd, sg, P['hip']-.01*P['k'])


def profile_at(rows, z):
    rows = sorted(rows)
    if z <= rows[0][0]:
        return rows[0][1:]
    for a, b in zip(rows, rows[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / max(1e-12, b[0] - a[0])
            return tuple(a[i] * (1-t) + b[i] * t for i in range(1, len(a)))
    return rows[-1][1:]


class NativeCollector:
    """Small PB-compatible collector; no Blender operators or scene objects."""

    def __init__(self):
        self.points, self.parts, self.faces = [], [], []

    def V(self, point, part):
        self.points.append(tuple(float(x) for x in point))
        self.parts.append(part)
        return len(self.points) - 1

    def F(self, vertices, colour, smooth=True, face=None, fab_=None, **unused):
        if fab_ != 'skin':
            return None
        vertices = tuple(dict.fromkeys(vertices))
        if len(vertices) >= 3:
            self.faces.append(vertices)
        return None


def _closed_parts(collector, label):
    """Weld exact native seams, orient each component and cap open boundary loops.

    Native surface vertices never move. New centre vertices belong only to the
    hidden caps. Open decorative nail plates are intentionally not body solids.
    """
    points, parts, mapping, lookup = [], [], {}, {}
    for i, (p, part) in enumerate(zip(collector.points, collector.parts)):
        key = tuple(round(x, 10) for x in p)
        if key not in lookup:
            lookup[key] = len(points); points.append(p); parts.append(part)
        mapping[i] = lookup[key]
    native_count = len(points)
    triangles = []
    for polygon in collector.faces:
        p = list(dict.fromkeys(mapping[i] for i in polygon))
        if len(p) < 3:
            continue
        for i in range(1, len(p)-1):
            face = (p[0], p[i], p[i+1])
            a, b, c = np.asarray([points[v] for v in face])
            if np.linalg.norm(np.cross(b-a, c-a)) > 1e-13:
                triangles.append(face)
    edges = defaultdict(list)
    for fi, face in enumerate(triangles):
        for a, b in zip(face, face[1:]+face[:1]):
            edges[tuple(sorted((a, b)))].append((fi, a, b))
    if any(len(v) > 2 for v in edges.values()):
        raise RuntimeError(label + ': nonmanifold native component')
    unseen = set(range(len(triangles))); out = []
    while unseen:
        seed = min(unseen); flips = {seed: False}; queue = deque([seed])
        while queue:
            fi = queue.popleft(); unseen.discard(fi)
            face = triangles[fi]
            for a, b in zip(face, face[1:]+face[:1]):
                for other, oa, ob in edges[tuple(sorted((a, b)))]:
                    if other == fi:
                        continue
                    want = flips[fi] ^ (a == oa and b == ob)
                    if other in flips and flips[other] != want:
                        raise RuntimeError(label + ': nonorientable native surface')
                    if other not in flips:
                        flips[other] = want; queue.append(other)
        faces = [tuple(reversed(triangles[i])) if flip else triangles[i] for i, flip in flips.items()]
        boundary = []
        for face in faces:
            for a, b in zip(face, face[1:]+face[:1]):
                if len(edges[tuple(sorted((a, b)))]) == 1:
                    boundary.append((a, b))
        successors = defaultdict(list)
        for a, b in boundary:
            successors[a].append(b)
        if any(len(v) != 1 for v in successors.values()):
            raise RuntimeError(label + ': ambiguous native boundary')
        added = 0
        while successors:
            first = min(successors); ring = [first]; current = first
            while True:
                nxt = successors.pop(current)[0]
                if nxt == first:
                    break
                if nxt in ring or nxt not in successors:
                    raise RuntimeError(label + ': open native boundary chain')
                ring.append(nxt); current = nxt
            center = tuple(np.mean([points[v] for v in ring], axis=0))
            ci = len(points); points.append(center); parts.append(parts[ring[0]])
            faces.extend((b, a, ci) for a, b in zip(ring, ring[1:]+ring[:1])); added += len(ring)
        volume = sum(float(np.dot(points[a], np.cross(points[b], points[c]))) for a, b, c in faces)
        if abs(volume) <= 1e-11:
            raise RuntimeError(label + ': native component has zero volume')
        if volume < 0:
            faces = [(a, c, b) for a, b, c in faces]
        used = sorted({v for face in faces for v in face}); remap = {v: i for i, v in enumerate(used)}
        out.append({'points': [points[v] for v in used], 'parts': [parts[v] for v in used],
                    'faces': [tuple(remap[v] for v in f) for f in faces], 'addedCapTriangles': added,
                    'nativeSurfaceVertices': sum(v < native_count for v in used),
                    'nativePositionSha256': hashlib.sha256(np.asarray([points[v] for v in used if v < native_count], dtype='<f8').tobytes()).hexdigest()})
    return out


def _capture(function, *args, **kwargs):
    collector = NativeCollector()
    # Native nail plates are decoration, not closed skin components. They do
    # not substitute for, inflate or move the actual native finger surface.
    previous = native_limbs._nail
    previous_ribbon = native_limbs._ribbon
    native_limbs._nail = lambda *a, **k: None
    native_limbs._ribbon = lambda *a, **k: None
    try:
        function(collector, *args, **kwargs)
    finally:
        native_limbs._nail = previous
        native_limbs._ribbon = previous_ribbon
    return collector


MAX_EXTRA_FAR_TORSO_ROWS = 8


def far_torso_row_indices(zs, rings):
    """Retain source sections whose omission most changes the torso surface.

    Uniformly dropping alternate heights bridges the native axilla recess and
    can invent body volume around a sleeve. Start with those same far stations,
    then retain up to eight omitted source rings with the largest transverse
    departure from their surrounding retained rings. No new position is made.
    The current body has 23 distinct near rings; this retains 20 distinct far
    rings and gives 1372/3516 triangles for the complete far/near body (39.02%).
    """
    rings = np.asarray(rings, dtype=np.float64)
    if len(zs)<2 or rings.ndim!=3 or rings.shape[0]!=len(zs) or rings.shape[1]<3 or rings.shape[2]!=3:
        raise ValueError('Far torso sampling requires matching source rings and heights')
    if not np.all(np.isfinite(rings)) or not all(math.isfinite(float(z)) for z in zs) or any(a>=b for a,b in zip(zs,zs[1:])):
        raise ValueError('Far torso sampling requires finite rings and increasing heights')
    kept = [i for i in range(len(zs)) if i%2==0 or i==len(zs)-1]
    errors = []
    for i,z in enumerate(zs):
        if i in kept:continue
        lo=max(j for j in kept if j<i);hi=min(j for j in kept if j>i)
        t=(z-zs[lo])/(zs[hi]-zs[lo])
        chord=rings[lo]*(1-t)+rings[hi]*t
        error=float(np.linalg.norm(chord[:,:2]-rings[i,:,:2],axis=1).max())
        errors.append((error,i))
    ranked=sorted(errors,key=lambda row:(-row[0],row[1]))
    return sorted(kept+[i for _,i in ranked[:MAX_EXTRA_FAR_TORSO_ROWS]])


def current_body(patterns):
    from people_wear_shapes import Mesh, ring
    pat = patterns; P = pat.P; pd = pat.pd; k = P['k']
    result = Mesh(getattr(pat, 'body_skin', pat.skin)); far_components = []; provenance = []

    def append(collector, name, origin, lod):
        for ci, chunk in enumerate(_closed_parts(collector, name)):
            first = len(result.far if lod else result.tri) * 3
            start = len(result.p)
            for point, part in zip(chunk['points'], chunk['parts']):
                result.vertex(point, part)
            faces = [tuple(v+start for v in f) for f in chunk['faces']]
            (result.far if lod else result.tri).extend(faces)
            component = {'name': name + ('_'+str(ci) if ci else ''), 'firstIndex': first, 'indexCount': len(faces)*3}
            (far_components if lod else result.components).append(component)
            provenance.append({**component, 'lod': int(lod), 'source': origin,
                               'exportedVertices': len(chunk['points']), 'nativeSurfaceVertices': chunk['nativeSurfaceVertices'],
                               'nativePositionSha256': chunk['nativePositionSha256'], 'addedCapTriangles': chunk['addedCapTriangles']})

    for lod in (False, True):
        # Keep the concave axilla's angular stations in the far body. A chord
        # over that recess would add invisible torso volume around the sleeve.
        n = 20
        zs = pat.body_levels()
        if lod:
            zs = [zs[i] for i in far_torso_row_indices(zs, [pat.body_ring(z,n) for z in zs])]
        torso = NativeCollector()
        rings = [pat.body_ring(z, n) for z in zs]
        native_body.mesh_loft(torso, rings, 'torso', pd['skin_hex'], 'skin')
        append(torso, 'torso', 'people_build.py:torso_ctrl/crv + people_body.py:torso_point; covered anatomy and native-limb axilla extension', lod)
        neck = NativeCollector()
        native_body.mesh_loft(neck, [ring(0, pat.lean(z), z, .050*k, .046*k, 6 if lod else 12)
                                    for z in np.linspace(P['nbase']-.01, P['chin']+.035, 3 if lod else 5)],
                              'neck', pd['skin_hex'], 'skin')
        append(neck, 'neck', 'people_build.py:proportions; covered neck continuation', lod)
        for sg in (-1, 1):
            sd = '_l' if sg < 0 else '_r'; sx = sg * (P['shw']-.012)
            profile = arm_profile(P, pd, sg)
            if lod:
                profile = [profile[i] for i in (0, 2, 3, 6, 8, 11)]
            else:
                ru = (.046 if P['fem'] else .052) * k * pd['build']**.5
                exposed = ((profile[2][0]+profile[3][0])*.5, ru, ru*1.02, .004*k)
                profile = sorted(profile+[exposed], reverse=True)
            arms = NativeCollector()
            rr = [native_limbs._ring(sx, cy, z, rx, ry, 6 if lod else 12) for z, rx, ry, cy in profile]
            tags = [('arm' if z >= pat.elbow else 'farm')+sd for z, *_ in profile]
            native_limbs._loft(arms, rr, tags, pd['skin_hex'], 'skin')
            append(arms, 'arm'+sd, 'people_body_limbs.py:append_arms native profile and exposed arm stations', lod)
            hand = _capture(native_limbs._hand, P, pd, sx, pat.wrist, sg, lod)
            append(hand, 'hand'+sd, 'people_body_limbs.py:_hand (native palm, fingers and thumb)', lod)
            bare = dict(pd, bot_style='bare', legs=pd['skin_hex'])
            leg = _capture(native_body._bare_leg, P, bare, sg, P['hip']-.01*k, lod)
            append(leg, 'leg'+sd, 'people_body.py:_bare_leg (native exposed leg surface)', lod)
        bare = dict(pd, shoe=('sandal', pd['skin_hex'], pd['skin_hex']))
        feet = _capture(native_limbs.append_feet, P, bare, lod)
        append(feet, 'foot', 'people_body_limbs.py:append_feet sandal skin only; rubber and straps omitted', lod)
    result.far_components = far_components
    result.sourceProvenance = {'schema': 1, 'adapter': 'current-native-body',
        'sourceTextLfSha256': {name: source_sha(HERE/name) for name in
                              ('people_build.py', 'people_body.py', 'people_body_limbs.py', 'people_cast.py', 'people_head.py', 'people_tex.py')},
        'components': provenance,
        'skinWeights': 'people_build.py:weights_for' if hasattr(pat, 'body_skin') else 'optional garment callback (diagnostic fallback)',
        'coveredAnatomy': 'Current torso contours and latent arm profile; covered torso has a 9 mm native-limb axilla recess. Hidden boundaries capped without moving native limb surface vertices.',
        'omittedDecorations': 'Open nail plates, shoe soles and sandal straps are not body solids.'}
    return result

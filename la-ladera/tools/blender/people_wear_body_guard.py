"""Versioned geometry guards for the old and regenerated cook's hip panels.

The legacy triangle has no meaning after new body contours change triangulation.
The current branch therefore pins its complete raw mesh and current source text,
without applying the old triangle's local refinement to an unrelated panel.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

LEGACY_BODY_VERSION = 'pr85-8f93ade'
CURRENT_BODY_VERSION = 'people-body-pr81-3854209'
SOURCE_TEXT_LF_SHA256 = {
    'people_body.py': '4e35b3b13ca98f3c26561a03043629256796621812fd451680cda92ed74f212f',
    'people_body_limbs.py': '282ad5ac0cb964040d177772e6ea420a83278350bed67528abdb6a1a00c2cdf8',
    'people_tex.py': '564281dd062f9cf09ae25571610690636659066a1389d13ddece0238445e4341',
    'people_head.py': 'baa48839759b7ecedf1918b9ef336f28dae12c888113b64b781c09009677eff2',
    'people_build.py': 'a292b2b36fc21a4d94145c57ae2cc0061c6037857f82bc92348f9232ebdb605a',
    'people_cast.py': '325bcaf571ab5eeb470c90e72e395ae1c79b3a404418b37bbea299645278d4e7',
}
# Regenerated after the 9 mm current-native arm/hand axilla recess replaced the
# overlapping clothed torso contour. Both trouser designs independently matched.
CURRENT_COCINERA_MESH_SHA256 = '97278cf17b44884754a57da9fd358129c850e7daef32c86462ec732138875bd8'


def mesh_fingerprint(mesh):
    """Hash every raw position, topology, UV, shade and named skin influence."""
    sha = hashlib.sha256()
    for name, data, dtype in (('p', mesh.p, '<f8'), ('uv', mesh.uv, '<f8'),
                              ('c', mesh.c, '<f8'), ('tri', mesh.tri, '<u4'), ('far', mesh.far, '<u4')):
        array = np.ascontiguousarray(data, dtype=dtype)
        sha.update(json.dumps([name, list(array.shape)], separators=(',', ':')).encode() + b'\0')
        sha.update(array.tobytes())
    sha.update(json.dumps(mesh.w, separators=(',', ':'), ensure_ascii=True).encode())
    return sha.hexdigest()


def legacy_cocinera_refinement(m):
    # Original PR #85 checks and barycentre operation are retained unchanged.
    # One complete-cut hip panel needs a central skin sample when seated.
    # Keep the actual bind surface, contour and original vertices; the
    # new source row is the exact barycentre of this guarded triangle.
    triangle=m.far[185]
    if len(m.far)!=512 or tuple(triangle)!=(210,692,686):
        raise RuntimeError('The authored w_cocinera hip panel changed')
    actual=np.asarray([m.p[v] for v in triangle],dtype=float)
    relative=np.asarray([(0.,0.,0.),
        (.024227425456047058,-.023338481783866882,-.0032612085342407227),
        (-.002062961459159851,-.005647338926792145,-.00874018669128418)])
    if not np.allclose(actual-actual[0],relative,rtol=0,atol=2e-7):
        raise RuntimeError('The authored w_cocinera hip geometry changed')
    weights={}
    for v in triangle:
        for bone,value in m.w[v]:weights[bone]=weights.get(bone,0.)+value/3
    weights={bone:value for bone,value in weights.items() if value>1e-10}
    if len(weights)>4:raise RuntimeError('The hip barycentre exceeds four skin influences')
    total=sum(weights.values())
    weights=sorted(((bone,value/total) for bone,value in weights.items()),key=lambda row:(-row[1],row[0]))
    point=tuple(sum(m.p[v][axis] for v in triangle)/3 for axis in range(3))
    uv=tuple(sum(m.uv[v][axis] for v in triangle)/3 for axis in range(2))
    center=m.vertex(point,'torso',uv,weights=weights)
    m.c[center]=tuple(sum(m.c[v][axis] for v in triangle)/3 for axis in range(4))
    a,b,c=triangle;m.far[185:186]=[(a,b,center),(b,c,center),(c,a,center)]
    return m


def guard_cocinera(mesh, body_version, source_dir=None):
    if body_version == LEGACY_BODY_VERSION:
        return legacy_cocinera_refinement(mesh)
    if body_version != CURRENT_BODY_VERSION:
        raise RuntimeError('Unrecognized wearable body version: ' + str(body_version))
    source_dir = Path(source_dir) if source_dir is not None else Path(__file__).resolve().parent
    for name, expected in SOURCE_TEXT_LF_SHA256.items():
        actual = hashlib.sha256((source_dir/name).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
        if actual != expected:
            raise RuntimeError('Current w_cocinera body source fingerprint changed: ' + name)
    actual = mesh_fingerprint(mesh)
    if actual != CURRENT_COCINERA_MESH_SHA256:
        raise RuntimeError('Current w_cocinera whole-mesh fingerprint changed: ' + actual)
    return mesh

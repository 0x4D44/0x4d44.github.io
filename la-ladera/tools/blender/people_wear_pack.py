"""Bounded far-body shading reuse during final, lossless-geometry GLB packing.

The near and far body are authored independently. A far-only vertex may reuse
the near normal at exactly the same encoded position, UV and skin attributes
when the *uploaded int8 normals* differ by at most five degrees. This permits
the existing exact-attribute vertex weld without moving any triangle corner.
The operation is for the optional body's final export, never for garment fit.
"""
from __future__ import annotations

import hashlib
import math

import numpy as np


MAX_FAR_NORMAL_DEGREES = 5.0


def _normal_directions(encoded):
    """Decode glTF normalized BYTE directions, including its -128 clamp."""
    values = np.maximum(np.asarray(encoded, dtype=np.float64) / 127., -1.)
    lengths = np.linalg.norm(values, axis=1)
    if np.any(lengths == 0.) or not np.all(np.isfinite(lengths)):
        raise ValueError('Used body normals must have nonzero finite directions')
    return values / lengths[:, None]


def _angles(first, second):
    a, b = _normal_directions(first), _normal_directions(second)
    # Identical encoded directions must stay exactly zero despite roundoff in
    # a unit-vector dot product. Every nonidentical pair uses the decoded data.
    angles = np.degrees(np.arccos(np.clip(np.sum(a*b, axis=1), -1., 1.)))
    angles[np.all(first == second, axis=1)] = 0.
    return angles


def _stream_digest(encoded, indices, names):
    digest = hashlib.sha256()
    for name in names:
        values = encoded[name]
        digest.update(name.encode('ascii') + b'\0')
        digest.update(values.dtype.str.encode('ascii') + b'\0')
        digest.update(values[indices].tobytes(order='C'))
    return digest.hexdigest()


def compact_body_streams(encoded, near_indices, far_indices):
    """Return compact encoded attributes and remapped, same-order triangles.

    ``encoded`` maps glTF attribute names to encoded NumPy arrays read with
    ``accessor_raw``. Near and far must share this original vertex pool. The
    result contains ``encoded``, uint16 ``near_indices``/``far_indices``, an
    old-to-new ``remap``, representative ``source_vertex_ids`` and ``metrics``.
    Inputs are never modified. All non-normal attributes are compared as bytes
    after expanding each output triangle, and every near normal remains exact.
    """
    required = {'POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'}
    if not required.issubset(encoded):
        raise ValueError('Body packing requires position, normal, UV and skin attributes')
    original = {name: np.asarray(values) for name, values in encoded.items()}
    position, normal = original['POSITION'], original['NORMAL']
    if position.ndim != 2 or position.shape[1] != 3 or position.dtype != np.dtype('<f4'):
        raise ValueError('Body packing requires Float32 VEC3 positions')
    if normal.shape != position.shape or normal.dtype != np.dtype('i1'):
        raise ValueError('Body packing requires uploaded int8 VEC3 normals')
    count = len(position)
    if not count or any(a.ndim != 2 or len(a) != count for a in original.values()):
        raise ValueError('Body attributes must share a nonempty vertex pool')
    if any(not np.issubdtype(a.dtype, np.number) for a in original.values()):
        raise ValueError('Body attributes must use numeric encoded values')
    if any(not np.all(np.isfinite(a)) for a in original.values()):
        raise ValueError('Body attributes must contain finite encoded values')

    def index_array(values):
        result = np.asarray(values)
        if not np.issubdtype(result.dtype, np.integer):
            raise ValueError('Body triangle indices must be integers')
        result = result.reshape(-1).astype(np.int64)
        if not len(result) or len(result) % 3 or np.any(result < 0) or np.any(result >= count):
            raise ValueError('Body triangle indices must form in-range triangles')
        return result

    near, far = index_array(near_indices), index_array(far_indices)
    near_used, far_used = np.unique(near), np.unique(far)
    _normal_directions(normal[np.union1d(near_used, far_used)])
    names = sorted(original)
    nonnormal = [name for name in names if name != 'NORMAL']
    changed = {name: values.copy() for name, values in original.items()}

    def matching_key(vertex):
        # Include *every* other stream, so UV seams, skin seams and any future
        # encoded attributes remain distinct, including Float32 signed zero.
        return tuple(original[name][vertex].tobytes() for name in nonnormal)

    lookup = {}
    for vertex in near_used:
        lookup.setdefault(matching_key(vertex), []).append(int(vertex))
    near_set = set(near_used.tolist())
    inherited = []
    for vertex in far_used:
        if int(vertex) in near_set:
            continue
        candidates = lookup.get(matching_key(vertex), [])
        if not candidates:
            continue
        choices = np.asarray(candidates, dtype=np.int64)
        angles = _angles(np.repeat(normal[vertex:vertex+1], len(choices), axis=0), normal[choices])
        best = int(np.argmin(angles))
        if float(angles[best]) <= MAX_FAR_NORMAL_DEGREES:
            source = choices[best]
            if not np.array_equal(normal[vertex], normal[source]):
                changed['NORMAL'][vertex] = normal[source]
                inherited.append(int(vertex))

    # Exact all-stream welding is deterministic and retains the first original
    # representative. No triangle is removed, reordered, or rewound.
    vertices, representatives = {}, []
    remap = np.empty(count, dtype=np.int64)
    for vertex in range(count):
        key = tuple(changed[name][vertex].tobytes() for name in names)
        if key not in vertices:
            vertices[key] = len(representatives)
            representatives.append(vertex)
        remap[vertex] = vertices[key]
    if len(representatives) > 65535:
        raise ValueError('Body packing exceeds the uint16 vertex contract')
    source_ids = np.asarray(representatives, dtype=np.int64)
    packed = {name: values[source_ids].copy() for name, values in changed.items()}
    new_near = remap[near].astype('<u2')
    new_far = remap[far].astype('<u2')

    # Check the actual emitted encoded values, independently of match decisions.
    # Expanding both index streams proves triangle geometry, UVs and skin bytes
    # survived, even when multiple original indices now share one vertex.
    for old_indices, new_indices in ((near, new_near), (far, new_far)):
        for name in nonnormal:
            if original[name][old_indices].tobytes() != packed[name][new_indices].tobytes():
                raise ValueError('Body packing changed indexed '+name+' bytes')
    if normal[near].tobytes() != packed['NORMAL'][new_near].tobytes():
        raise ValueError('Body packing changed a near normal')
    final_angles = _angles(normal[far], packed['NORMAL'][new_far])
    if np.any(final_angles > MAX_FAR_NORMAL_DEGREES):
        raise ValueError('Packed far normals exceed the five-degree encoded bound')
    stride = sum(math.ceil(a.shape[1]*a.dtype.itemsize/4)*4 for a in original.values())
    metrics = {
        'method': 'exact-attribute-body-weld-with-bounded-far-normal-reuse',
        'maximumAllowedNormalDegrees': MAX_FAR_NORMAL_DEGREES,
        'maximumChangedNormalDegrees': float(np.max(final_angles)),
        'meanChangedNormalDegrees': float(np.mean(final_angles[final_angles > 0.])) if np.any(final_angles > 0.) else 0.,
        'inheritedFarVertices': len(inherited),
        'sourceVertices': count, 'packedVertices': len(source_ids),
        'removedDuplicateVertices': count-len(source_ids),
        'vertexStrideBytes': stride,
        'vertexGpuBytesSaved': (count-len(source_ids))*stride,
        'nearTriangles': len(near)//3, 'farTriangles': len(far)//3,
        'nearNonnormalTriangleSha256': _stream_digest(original, near, nonnormal),
        'farNonnormalTriangleSha256': _stream_digest(original, far, nonnormal),
        'nearNormalTriangleSha256': hashlib.sha256(normal[near].tobytes()).hexdigest(),
    }
    return {'encoded': packed, 'near_indices': new_near, 'far_indices': new_far,
            'source_vertex_ids': source_ids, 'remap': remap, 'metrics': metrics}

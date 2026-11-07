"""Reduce an authored garment's far cut without changing its source vertices.

This is an authoring operation, before the independent posed clearance check.
Only existing edges collapse, only to an existing endpoint. Near faces, positions,
skin weights, UVs and colours remain byte-for-byte authoring inputs. The link
condition preserves connected surfaces and their openings; UV/skin seam copies
collapse together to matching existing copies. An impossible budget raises
rather than dropping a patch or a face.
Native body components and the retained identity/proxy do not use this helper.
"""
from __future__ import annotations

from collections import defaultdict
import heapq
import numpy as np


def _edges(face):
    a, b, c = face
    return ((min(a, b), max(a, b)), (min(b, c), max(b, c)),
            (min(c, a), max(c, a)))


def _topology(faces):
    """Surface components, Euler characteristics and boundary loop counts."""
    edges = defaultdict(list)
    for fi, face in enumerate(faces):
        if len(set(face)) != 3:
            raise ValueError('degenerate garment far triangle')
        for edge in _edges(face):
            edges[edge].append(fi)
    if any(len(ids) > 2 for ids in edges.values()):
        raise ValueError('non-manifold garment far edge')
    adjacent = [set() for _ in faces]
    for ids in edges.values():
        if len(ids) == 2:
            a, b = ids
            adjacent[a].add(b)
            adjacent[b].add(a)
    seen = set()
    signature = []
    for start in range(len(faces)):
        if start in seen:
            continue
        stack = [start]
        component = set()
        while stack:
            fi = stack.pop()
            if fi in component:
                continue
            component.add(fi)
            stack.extend(adjacent[fi] - component)
        seen.update(component)
        vertices = {v for fi in component for v in faces[fi]}
        component_edges = {e for fi in component for e in _edges(faces[fi])}
        boundary = defaultdict(set)
        for a, b in component_edges:
            if len(edges[(a, b)]) == 1:
                boundary[a].add(b)
                boundary[b].add(a)
        if any(len(ns) != 2 for ns in boundary.values()):
            raise ValueError('non-manifold garment far boundary')
        visited = set()
        loops = 0
        for first in boundary:
            if first in visited:
                continue
            loops += 1
            todo = [first]
            while todo:
                v = todo.pop()
                if v in visited:
                    continue
                visited.add(v)
                todo.extend(boundary[v] - visited)
        signature.append((len(vertices) - len(component_edges) + len(component), loops))
    return sorted(signature)


def reduce_garment_far(mesh, label='garment'):
    """Enforce far <= 40% of near and <= 600 while preserving surface topology.

    Returns measured authoring metadata. A failed operation leaves ``mesh.far``
    untouched. The resulting cut still requires the complete clearance gate;
    endpoint reduction alone does not certify any posed body/cloth clearance.
    """
    source = [tuple(int(v) for v in face) for face in mesh.far]
    target = min(600, (2 * len(mesh.tri)) // 5)
    if not source or not mesh.tri or target < 1:
        raise ValueError(label + ': empty or impossible garment LOD budget')
    topology = _topology(source)
    if len(source) <= target:
        return dict(sourceTriangles=len(source), triangles=len(source),
                    targetTriangles=target, collapses=0, seamCollapses=0, topology=topology)
    positions = np.asarray(mesh.p, dtype=np.float64)
    if positions.ndim != 2 or positions.shape[1] != 3 or not np.isfinite(positions).all():
        raise ValueError(label + ': invalid source positions')
    count = len(positions)
    if any(min(f) < 0 or max(f) >= count for f in source):
        raise ValueError(label + ': invalid far index')
    faces = list(source)
    alive = [True] * len(faces)
    incident = [set() for _ in positions]
    neighbors = [set() for _ in positions]
    edge_faces = defaultdict(set)
    face_keys = {}
    quadrics = np.zeros((count, 4, 4), dtype=np.float64)
    original_normals = np.empty((len(faces), 3), dtype=np.float64)
    for fi, face in enumerate(faces):
        key = tuple(sorted(face))
        if key in face_keys:
            raise ValueError(label + ': duplicate far face')
        face_keys[key] = fi
        a, b, c = positions[list(face)]
        normal = np.cross(b-a, c-a)
        length = float(np.linalg.norm(normal))
        if length <= 1e-16:
            raise ValueError(label + ': zero-area far face')
        original_normals[fi] = normal / length
        plane = np.r_[normal / length, -np.dot(normal / length, a)]
        q = np.outer(plane, plane) * length
        for v in face:
            incident[v].add(fi)
            quadrics[v] += q
        for a, b in _edges(face):
            neighbors[a].add(b)
            neighbors[b].add(a)
            edge_faces[(a, b)].add(fi)

    # Coincident vertices encode an intentional attribute seam or a touching
    # independent panel. A seam station may collapse only as a complete group:
    # each source copy needs its own already-adjacent endpoint copy. Moving one
    # side alone would open a crack; merging the copies would erase a UV chart.
    by_position = defaultdict(list)
    used = {v for f in source for v in f}
    for v in used:
        by_position[tuple(round(float(x), 9) for x in positions[v])].append(v)
    groups = {min(group): set(group) for group in by_position.values()}
    group_of = {v: key for key, group in groups.items() for v in group}
    uv = np.asarray(mesh.uv, dtype=np.float64)
    texture_seam = set()
    # The circular loft's texture seam is an actual edge, not necessarily two
    # coincident vertices. Its two original rows must retain their UV endpoints.
    for (a, b), ids in edge_faces.items():
        if abs(uv[a, 0] - uv[b, 0]) > .5:
            texture_seam.update((a, b))
        if len(ids) == 1:
            # Boundary planes penalise silhouette drift, while straight opening
            # edges may lose an intermediate endpoint without changing contour.
            tangent = positions[b] - positions[a]
            normal = np.cross(tangent, original_normals[next(iter(ids))])
            length = float(np.linalg.norm(normal))
            if length > 1e-16:
                normal /= length
                plane = np.r_[normal, -np.dot(normal, positions[a])]
                q = np.outer(plane, plane) * float(np.linalg.norm(tangent)) * 10
                quadrics[a] += q
                quadrics[b] += q
    weights = [{bone: value for bone, value in row} for row in mesh.w]
    group_quadrics = {key: np.sum(quadrics[sorted(group)], axis=0)
                      for key, group in groups.items()}
    versions = [0] * count
    heap = []
    queued = set()

    def endpoint_map(a, b):
        """Injective seam-copy correspondence along existing source edges."""
        keep = {v for v in groups[a] if incident[v]}
        remove = {v for v in groups[b] if incident[v]}
        if not keep or not remove or len(remove) > len(keep):
            return None
        mapping = {}
        used_keep = set()
        for v in sorted(remove):
            candidates = neighbors[v] & keep
            if v in texture_seam:
                candidates = {k for k in candidates if k in texture_seam
                              and abs(uv[k, 0] - uv[v, 0]) < 1e-7}
            candidates -= used_keep
            if not candidates:
                return None
            k = min(candidates, key=lambda k: (float(np.dot(uv[k]-uv[v], uv[k]-uv[v])), k))
            mapping[v] = k
            used_keep.add(k)
        return mapping

    def queue(a, b):
        a, b = group_of[a], group_of[b]
        key = (a, b, versions[a], versions[b])
        if a == b or key in queued:
            return
        mapping = endpoint_map(a, b)
        if mapping is None:
            return
        point = np.r_[positions[a], 1.]
        cost = max(0., float(point @ (group_quadrics[a] + group_quadrics[b]) @ point))
        length2 = float(np.dot(positions[a]-positions[b], positions[a]-positions[b]))
        bones = weights[a].keys() | weights[b].keys()
        skin = sum((weights[a].get(bone, 0.) - weights[b].get(bone, 0.)) ** 2 for bone in sorted(bones))
        cost += length2 * (1e-9 + skin * .01)
        heapq.heappush(heap, (cost, a, b, versions[a], versions[b]))
        queued.add(key)

    for a, b in edge_faces:
        queue(a, b)
        queue(b, a)
    live_count = len(faces)
    collapses = 0
    seam_collapses = 0
    while live_count > target and heap:
        _, keep_group, remove_group, ka, rb = heapq.heappop(heap)
        if ka != versions[keep_group] or rb != versions[remove_group]:
            continue
        mapping = endpoint_map(keep_group, remove_group)
        if mapping is None:
            continue
        removed_faces = set()
        shared_faces = set()
        affected = set()
        valid = True
        for remove, keep in mapping.items():
            edge = (min(keep, remove), max(keep, remove))
            shared = edge_faces.get(edge, set())
            opposite = {v for fi in shared for v in faces[fi]} - {keep, remove}
            if (len(shared) not in (1, 2)
                    or neighbors[keep] & neighbors[remove] != opposite
                    or not incident[remove] - shared):
                valid = False
                break
            boundary_keep = any(len(edge_faces[(min(keep, v), max(keep, v))]) == 1 for v in neighbors[keep])
            boundary_remove = any(len(edge_faces[(min(remove, v), max(remove, v))]) == 1 for v in neighbors[remove])
            if boundary_remove and (not boundary_keep or len(shared) != 1):
                valid = False
                break
            removed_faces.update(incident[remove])
            shared_faces.update(shared)
            affected.update(neighbors[keep] | neighbors[remove] | {keep, remove})
        if not valid:
            continue
        changed = removed_faces - shared_faces
        replacements = {}
        new_keys = set()
        for fi in changed:
            face = tuple(mapping.get(v, v) for v in faces[fi])
            key = tuple(sorted(face))
            other = face_keys.get(key)
            if len(set(face)) != 3 or key in new_keys or (other is not None and other not in removed_faces):
                valid = False
                break
            a, b, c = positions[list(face)]
            normal = np.cross(b-a, c-a)
            length = float(np.linalg.norm(normal))
            if length <= 1e-16 or np.dot(normal, original_normals[fi]) <= .1 * length:
                valid = False
                break
            replacements[fi] = face
            new_keys.add(key)
        if not valid or not changed:
            continue
        removed_count = len(shared_faces)
        for fi in removed_faces:
            old = faces[fi]
            face_keys.pop(tuple(sorted(old)))
            for v in old:
                incident[v].remove(fi)
            for a, b in _edges(old):
                edge_faces[(a, b)].remove(fi)
                if not edge_faces[(a, b)]:
                    del edge_faces[(a, b)]
                    neighbors[a].discard(b)
                    neighbors[b].discard(a)
            alive[fi] = False
        for fi, face in replacements.items():
            faces[fi] = face
            alive[fi] = True
            face_keys[tuple(sorted(face))] = fi
            for v in face:
                incident[v].add(fi)
            for a, b in _edges(face):
                edge_faces[(a, b)].add(fi)
                neighbors[a].add(b)
                neighbors[b].add(a)
        live_count -= removed_count
        group_quadrics[keep_group] += group_quadrics[remove_group]
        collapses += 1
        seam_collapses += int(len(mapping) > 1)
        affected = {copy for v in affected for copy in groups[group_of[v]]}
        for group in {group_of[v] for v in affected}:
            versions[group] += 1
        changed_edges = {(min(v, n), max(v, n)) for v in affected for n in neighbors[v]}
        for a, b in sorted(changed_edges):
            queue(a, b)
            queue(b, a)
    result = [f for f, valid in zip(faces, alive) if valid]
    if len(result) > target:
        raise RuntimeError(f'{label}: topology-preserving far cut stopped at {len(result)} > {target} triangles')
    if _topology(result) != topology:
        raise RuntimeError(label + ': far reduction changed a surface component or opening')
    used_result = {v for f in result for v in f}
    if any(len(group & used_result) not in (0, len(group)) for group in groups.values()):
        raise RuntimeError(label + ': far reduction split an attribute seam')
    mesh.far = result
    return dict(sourceTriangles=len(source), triangles=len(result),
                targetTriangles=target, collapses=collapses,
                seamCollapses=seam_collapses, topology=topology)

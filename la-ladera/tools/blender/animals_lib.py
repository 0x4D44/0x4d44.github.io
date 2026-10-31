"""Small animal mesh/skin writer, sharing the furniture builder's geometry and colour conventions.

Runs INSIDE background Blender. Blender evaluates and decimates the far meshes. A deterministic
glTF packer (the same approach as people_build.py's post-export packer) keeps the authored nine
key poses instead of baking every frame. No texture, decoder, add-on, or downloaded source is needed.
Coordinates throughout are metres, +Y up, +Z forward, feet at zero.
"""
import json
import math
import os
import struct
from collections import OrderedDict

import bpy
import furn_lib as F

TAU = math.tau


def ellipsoid(center, radius, segments=12, rings=7, rot=(0, 0, 0)):
    """Closed smooth ellipsoid with analytic normals; furniture Geo removes pole degenerates."""
    pos, normals, uv, faces = [], [], [], []
    m = F._rotm(*rot)
    for i in range(rings + 1):
        phi = math.pi * i / rings
        for j in range(segments):
            theta = TAU * j / segments
            unit = (math.sin(phi) * math.cos(theta), math.cos(phi), math.sin(phi) * math.sin(theta))
            p = F._apply(m, tuple(unit[k] * radius[k] for k in range(3)))
            n = F._apply(m, F._unit(tuple(unit[k] / radius[k] for k in range(3))))
            pos.append(tuple(p[k] + center[k] for k in range(3)))
            normals.append(n)
            uv.append((j / segments, i / rings))
    for i in range(rings):
        for j in range(segments):
            a, b = i * segments + j, i * segments + (j + 1) % segments
            faces.extend(((a, b, b + segments), (a, b + segments, a + segments)))
    return pos, normals, uv, faces


def loft(profile, segments=12):
    """Anatomical trunk: elliptical rings (z, y, width-radius, height-radius)."""
    pos, normals, uv, faces = [], [], [], []
    for k, (z, y, rx, ry) in enumerate(profile):
        for j in range(segments):
            a = TAU * j / segments
            pos.append((rx * math.cos(a), y + ry * math.sin(a), z))
            before, after = profile[max(0, k - 1)], profile[min(len(profile) - 1, k + 1)]
            tangent = (math.cos(a) * (after[2] - before[2]), after[1] - before[1] + math.sin(a) * (after[3] - before[3]), after[0] - before[0])
            cross = (-rx * math.sin(a), ry * math.cos(a), 0)
            normals.append(F._unit(F._cross(cross, tangent)))
            uv.append((j / segments, k / (len(profile) - 1)))
    for k in range(len(profile) - 1):
        for j in range(segments):
            a, b = k * segments + j, k * segments + (j + 1) % segments
            faces.extend(((a, b, b + segments), (a, b + segments, a + segments)))
    for end, nz in ((0, -1), (len(profile) - 1, 1)):
        z, y, _, _ = profile[end]
        c = len(pos); pos.append((0, y, z)); normals.append((0, 0, nz)); uv.append((0.5, 0.5))
        for j in range(segments):
            faces.append((c, end * segments + j, end * segments + (j + 1) % segments))
    return pos, normals, uv, faces


class Animal:
    def __init__(self, key, far=False):
        self.key, self.far = key, far
        self.groups = OrderedDict()
        self.joints = {}
        self.bones = OrderedDict()
        self.clips = {}
        self.bone('root', (0, 0, 0), None)

    def bone(self, name, position, parent='root'):
        self.bones[name] = {'position': tuple(position), 'parent': parent}
        return name

    def emit(self, geom, colour, bone='body', material='fur', colour_fn=None):
        key = (material, False, ())
        if key not in self.groups:
            self.groups[key] = F.Geo()
            self.joints[key] = []
        g = self.groups[key]; start = len(g.P)
        g.add(*geom, colour)
        self.joints[key].extend([bone] * (len(g.P) - start))
        if colour_fn:
            for i in range(start, len(g.P)):
                g.C[i] = F.lin3(colour_fn(g.P[i]))

    def egg(self, center, radius, colour, bone='body', n=None, rings=None, rot=(0, 0, 0), colour_fn=None):
        self.emit(ellipsoid(center, radius, n or (5 if self.far else 10), rings or (3 if self.far else 6), rot), colour, bone, colour_fn=colour_fn)

    def tube(self, points, radii, colour, bone='body', n=None, material='fur', caps=True, colour_fn=None):
        self.emit(F.tube_geo(points, radii, n or (4 if self.far else 7), caps), colour, bone, material, colour_fn)

    def box(self, center, size, colour, bone='body', material='fur'):
        p, n, uv, f = F.rbox_geo(*(v / 2 for v in size))
        self.emit(([tuple(v[k] + center[k] for k in range(3)) for v in p], n, uv, f), colour, bone, material)

    def fin(self, points, width, colour, bone='body'):
        """Tapered solid ear / feather, with a small ridge and a proper back face."""
        base, tip = points
        middle = tuple(base[k] * 0.35 + tip[k] * 0.65 for k in range(3))
        p = [(base[0] - width, base[1], base[2]), (base[0] + width, base[1], base[2]),
             (tip[0], tip[1], tip[2]), (middle[0], middle[1], middle[2] + width * 0.35),
             (middle[0], middle[1], middle[2] - width * 0.35)]
        triangles = [(0, 1, 3), (1, 2, 3), (2, 0, 3), (1, 0, 4), (2, 1, 4), (0, 2, 4)]
        interior = tuple(sum(v[k] for v in p) / len(p) for k in range(3))
        ps, ns, uv, fs = [], [], [], []
        for face in triangles:
            a, b, c = [p[i] for i in face]
            norm = F._unit(F._cross(F._sub(b, a), F._sub(c, a)))
            centroid = tuple((a[k] + b[k] + c[k]) / 3 for k in range(3))
            # Ears point up; folded ears and tail feathers may point down. The
            # winding must follow the solid's outside in either orientation.
            if F._dot(norm, F._sub(centroid, interior)) < 0:
                b, c = c, b
                norm = tuple(-v for v in norm)
            offset = len(ps); ps.extend((a, b, c)); ns.extend((norm,) * 3); uv.extend(((0, 0), (1, 0), (0.5, 1)))
            fs.append((offset, offset + 1, offset + 2))
        self.emit((ps, ns, uv, fs), colour, bone)

    @property
    def triangles(self):
        return sum(len(g.I) for g in self.groups.values())

    def floor(self):
        bottom = min(p[1] for g in self.groups.values() for p in g.P)
        for g in self.groups.values():
            g.P = [(p[0], p[1] - bottom, p[2]) for p in g.P]
        for b in self.bones.values():
            p = b['position']; b['position'] = (p[0], p[1] - bottom, p[2])
        # The unanimated skeleton root stays at the model origin. Other local offsets use the new rest positions.
        self.bones['root']['position'] = (0, 0, 0)

    def bounds(self):
        allp = [p for g in self.groups.values() for p in g.P]
        return [[min(p[k] for p in allp) for k in range(3)], [max(p[k] for p in allp) for k in range(3)]]


def far_mesh(animal, target=288):
    """Evaluate the hand-simplified silhouette in Blender and cap it with the native decimator.

    Work on each material independently, keep vertex colours, then deduplicate export corners.
    The far mesh is static: no hidden skin or animation evaluation survives in its GLB.
    """
    F.reset()
    root = F.build_objects(animal, bpy.context.scene.collection)
    objects = list(root.children)
    total = sum(len(o.data.polygons) for o in objects)
    groups = OrderedDict()
    for ob in objects:
        budget = max(12, int(target * len(ob.data.polygons) / total))
        if len(ob.data.polygons) > budget:
            mod = ob.modifiers.new('animal_far_budget', 'DECIMATE')
            mod.ratio = budget / len(ob.data.polygons)
            mod.use_collapse_triangulate = True
        evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        ca, uv = mesh.color_attributes.active_color, mesh.uv_layers.active
        g = F.Geo(); g.has_col = True
        for tri in mesh.loop_triangles:
            idx = []
            for li in tri.loops:
                vi = mesh.loops[li].vertex_index
                p, n = mesh.vertices[vi].co, mesh.corner_normals[li].vector
                idx.append(len(g.P)); g.P.append((p.x, p.z, -p.y)); g.N.append((n.x, n.z, -n.y))
                g.UV.append(tuple(uv.data[li].uv) if uv else (0, 0))
                g.C.append(tuple(ca.data[li].color[:3]) if ca else (1, 1, 1))
            g.I.append(tuple(idx))
        groups[(ob.data.materials[0].name, False, ())] = g
        evaluated.to_mesh_clear()
    animal.groups = groups
    if animal.triangles > 300:
        raise ValueError(f'{animal.key}: far mesh {animal.triangles} > 300 triangles')


def quaternion(rx=0, ry=0, rz=0):
    # XYZ intrinsic rotations; consistent with the game's +Y up / +Z facing frame.
    cx, sx = math.cos(rx / 2), math.sin(rx / 2)
    cy, sy = math.cos(ry / 2), math.sin(ry / 2)
    cz, sz = math.cos(rz / 2), math.sin(rz / 2)
    return (sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz,
            cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz)


def clip(animal, name, duration, poses):
    """poses: {bone: callback(phase)->(rx,ry,rz)}. Nine poses, matching first/last for a seamless loop."""
    animal.clips[name] = {'duration': duration, 'poses': poses}


def write_glb(animal, path):
    """Explicit standard glTF 2.0 arrays, with no compression or extensions required at runtime."""
    binary = bytearray()
    j = {'asset': {'version': '2.0', 'generator': 'La Ladera animals_build.py v1 (Blender + furn_lib)',
                   'copyright': 'Original La Ladera animal assets; CC0-1.0'},
         'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': animal.key, 'children': []}],
         'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}

    def accessor(values, kind, component=5126, normalized=False, target=None, bounds=False):
        while len(binary) % 4:
            binary.append(0)
        count = len(values)
        flat = [q for v in values for q in (v if isinstance(v, (tuple, list)) else [v])]
        fmt = {5126: 'f', 5123: 'H', 5121: 'B'}[component]
        data = struct.pack('<' + fmt * len(flat), *flat)
        view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
        if target:
            view['target'] = target
        binary.extend(data); j['bufferViews'].append(view)
        acc = {'bufferView': len(j['bufferViews']) - 1, 'componentType': component, 'count': count, 'type': kind}
        if normalized:
            acc['normalized'] = True
        if bounds:
            rows = [v if isinstance(v, (list, tuple)) else [v] for v in values]
            acc['min'] = [min(r[k] for r in rows) for k in range(len(rows[0]))]
            acc['max'] = [max(r[k] for r in rows) for k in range(len(rows[0]))]
        j['accessors'].append(acc)
        return len(j['accessors']) - 1

    bones = list(animal.bones)
    bone_index = {name: i for i, name in enumerate(bones)}
    if not animal.far:
        for name, b in animal.bones.items():
            parent = b['parent']; bp = animal.bones[parent]['position'] if parent else (0, 0, 0)
            node = {'name': f'{animal.key}_{name}', 'translation': [b['position'][k] - bp[k] for k in range(3)], 'children': []}
            j['nodes'].append(node)
            parent_idx = bone_index[parent] + 1 if parent else 0
            j['nodes'][parent_idx]['children'].append(len(j['nodes']) - 1)
        inverse = []
        for b in animal.bones.values():
            x, y, z = b['position']
            inverse.append((1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1))
        j['skins'] = [{'name': animal.key + '_rig', 'joints': list(range(1, len(bones) + 1)),
                       'skeleton': 1, 'inverseBindMatrices': accessor(inverse, 'MAT4')}]

    for key, g in animal.groups.items():
        material = key[0]
        j['materials'].append({'name': material, 'pbrMetallicRoughness': {
            'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.6 if material == 'galvanised' else 0,
            'roughnessFactor': 0.6 if material == 'galvanised' else 0.95}})
        # Deduplicate positions only when normals, colours, UVs and skin assignments also agree.
        unique, positions, normals, uvs, colours, joints, weights, indices = {}, [], [], [], [], [], [], []
        for triangle in g.I:
            for vi in triangle:
                colour = tuple(max(0, min(255, round(c * 255))) for c in g.C[vi]) + (255,)
                bone = bone_index[animal.joints[key][vi]] if not animal.far else 0
                token = tuple(round(v, 7) for v in (*g.P[vi], *g.N[vi], *g.UV[vi])) + colour + (bone,)
                if token not in unique:
                    unique[token] = len(positions)
                    positions.append(g.P[vi]); normals.append(g.N[vi]); uvs.append(g.UV[vi]); colours.append(colour)
                    joints.append((bone, 0, 0, 0)); weights.append((255, 0, 0, 0))
                indices.append(unique[token])
        attrs = {'POSITION': accessor(positions, 'VEC3', target=34962, bounds=True),
                 'NORMAL': accessor(normals, 'VEC3', target=34962),
                 'TEXCOORD_0': accessor(uvs, 'VEC2', target=34962),
                 'COLOR_0': accessor(colours, 'VEC4', 5121, True, 34962)}
        if not animal.far:
            attrs.update({'JOINTS_0': accessor(joints, 'VEC4', 5121, target=34962),
                          'WEIGHTS_0': accessor(weights, 'VEC4', 5121, True, 34962)})
        j['meshes'].append({'name': animal.key + '_' + material, 'primitives': [
            {'attributes': attrs, 'indices': accessor(indices, 'SCALAR', 5123, target=34963), 'material': len(j['materials']) - 1}]})
        node = {'name': animal.key + '_' + material, 'mesh': len(j['meshes']) - 1}
        if not animal.far:
            node['skin'] = 0
        j['nodes'].append(node); j['nodes'][0]['children'].append(len(j['nodes']) - 1)

    if not animal.far:
        j['animations'] = []
        for name, c in animal.clips.items():
            times = [c['duration'] * i / 8 for i in range(9)]
            input_idx = accessor(times, 'SCALAR', bounds=True)
            animation = {'name': name, 'samplers': [], 'channels': []}
            for bone, fn in c['poses'].items():
                poses = [quaternion(*fn(i * TAU / 8)) for i in range(9)]
                poses[-1] = poses[0]
                if max(abs(v - poses[0][k]) for p in poses for k, v in enumerate(p)) < 1e-6:
                    continue
                si = len(animation['samplers'])
                animation['samplers'].append({'input': input_idx, 'output': accessor(poses, 'VEC4'), 'interpolation': 'LINEAR'})
                animation['channels'].append({'sampler': si, 'target': {'node': bone_index[bone] + 1, 'path': 'rotation'}})
            j['animations'].append(animation)

    for node in j['nodes']:
        if not node.get('children'):
            node.pop('children', None)
    j['buffers'] = [{'byteLength': len(binary)}]
    text = json.dumps(j, separators=(',', ':'), ensure_ascii=True).encode('utf8')
    text += b' ' * (-len(text) % 4); binary.extend(b'\0' * (-len(binary) % 4))
    data = (struct.pack('<III', 0x46546c67, 2, 28 + len(text) + len(binary)) +
            struct.pack('<II', len(text), 0x4e4f534a) + text + struct.pack('<II', len(binary), 0x004e4942) + binary)
    with open(path, 'wb') as stream:
        stream.write(data)
    return len(data)

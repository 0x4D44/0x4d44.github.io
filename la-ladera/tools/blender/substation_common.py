"""Substation primitives in metres, +Y up and +Z front.

Only this adapter knows Blender. Geometry modules use the furniture library's
analytic primitives. Repeated components are linked mesh datablocks in glTF,
not merely repeated disconnected triangles. No texture bytes are embedded.
"""
import hashlib
import json
import math
from copy import deepcopy
import bpy
import furn_lib as L

CELL_NAMES = ('galvanised rusted_steel porcelain_brown porcelain_grey paint_uk '
              'paint_lightgrey paint_co paint_peeling concrete_clean concrete_damp '
              'concrete_algae gravel rubber brick rendered_block oil_stain wood '
              'fence_green glass lamp copper dry_vegetation black_steel white '
              'steel_dark moss chainlink palisade warning_yellow paint_control battery roof').split()
CELLS = {'substation_' + name: i for i, name in enumerate(CELL_NAMES)}
CELLS.update({'substation_paint': 4, 'substation_porcelain': 2,
              'substation_rust': 1, 'substation_concrete': 8,
              'substation_concrete_weathered': 9, 'substation_oil': 15,
              'substation_render': 14, 'substation_dark': 24,
              'substation_vegetation': 21})
_MESH_CACHE = {}
_NORMALIZERS = {}


def reset():
    L.reset()
    _MESH_CACHE.clear()
    _NORMALIZERS.clear()


class Surface(L.Asset):
    """Furn_lib surface with guttered atlas UVs for every primitive."""
    def __init__(self, key, cat):
        super().__init__(key, cat)
        self.sign_cell = None

    def _emit(self, mat, geom, col=None, tint=False, flags=(), rot=(0, 0, 0), off=(0, 0, 0), scl=None):
        p, n, uv, tris = geom
        if mat == 'substation_signs':
            u0, v0, u1, v1 = self.sign_cell or (0.01, 0.01, 0.99, 0.99)
        else:
            if mat not in CELLS:
                raise ValueError('Unknown substation material: ' + mat)
            cell = CELLS[mat]
            u0, v0 = ((cell % 8) * 128 + 4) / 1024, ((cell // 8) * 256 + 4) / 1024
            u1, v1 = ((cell % 8 + 1) * 128 - 4) / 1024, ((cell // 8 + 1) * 256 - 4) / 1024
        lo = [min(v[i] for v in uv) for i in range(2)]
        hi = [max(v[i] for v in uv) for i in range(2)]
        uv = [(u0 + (u1-u0)*(u-lo[0])/max(hi[0]-lo[0], 1e-8),
               1-(v0 + (v1-v0)*(v-lo[1])/max(hi[1]-lo[1], 1e-8))) for u, v in uv]
        super()._emit(mat, (p, n, uv, tris), col, tint, flags, rot, off, scl)


def _mul(m, v):
    return tuple(sum(m[i][k]*v[k] for k in range(3)) for i in range(3))


def _transpose(m):
    return tuple(tuple(m[j][i] for j in range(3)) for i in range(3))


class Assembly:
    """An identity root, static body and independently movable named pivots.

    Positions/rotations are in the game frame. Every part gets a pivot even if
    fixed, so callers can instance fins, sheds, fence panels and lamp heads.
    The near assembly supplies one envelope correction used by both LODs.
    """
    def __init__(self, key, cat, lod):
        self.base_key, self.cat, self.lod = key, cat, lod
        self.key = key + ('_lod1' if lod else '')
        self.body = Surface(self.key, cat)
        self.parts = []

    def part(self, suffix, position=(0, 0, 0), rotation=(0, 0, 0), cache=None):
        surf = Surface(self.key + '-' + suffix, self.cat)
        self.parts.append({'name': suffix, 'position': tuple(position), 'rotation': tuple(rotation),
                           'surface': surf, 'cache': cache})
        return surf

    def triangles(self):
        return sum(len(g.I) for g in self.body.groups.values()) + sum(
            len(g.I) for part in self.parts for g in part['surface'].groups.values())

    def bounds(self):
        points = [p for g in self.body.groups.values() for p in g.P]
        for part in self.parts:
            m = L._rotm(*part['rotation'])
            points.extend(tuple(_mul(m, p)[i]+part['position'][i] for i in range(3))
                          for g in part['surface'].groups.values() for p in g.P)
        return ([min(p[i] for p in points) for i in range(3)],
                [max(p[i] for p in points) for i in range(3)])

    def _normalizer(self):
        if self.base_key not in _NORMALIZERS:
            lo, hi = self.bounds()
            dims = [hi[i]-lo[i] for i in range(3)]
            scale = [self.cat['size'][i]/dims[i] for i in range(3)]
            # Authored dimensions must already resemble the intended object.
            # Only the public primitive convention/envelope is regularised.
            if min(scale) < .65 or max(scale) > 1.5:
                raise ValueError(f'{self.base_key}: implausible authored envelope {dims}; target {self.cat["size"]}')
            offset = [-.5*(lo[0]+hi[0])*scale[0], -lo[1]*scale[1], -.5*(lo[2]+hi[2])*scale[2]]
            _NORMALIZERS[self.base_key] = (scale, offset)
        return _NORMALIZERS[self.base_key]

    def create(self):
        scale, offset = self._normalizer()
        col = bpy.context.scene.collection
        root = bpy.data.objects.new(self.key, None)
        col.objects.link(root)
        root['units'] = 'metres'
        root['front'] = '+Z'

        def create_surface(surface, parent, rotation=(0, 0, 0)):
            m, im = L._rotm(*rotation), _transpose(L._rotm(*rotation))
            for gi, ((mat, tint, flags), source) in enumerate(surface.groups.items()):
                if not source.I:
                    continue
                g = deepcopy(source)
                g.P = [_mul(im, tuple(v*scale[i] for i, v in enumerate(_mul(m, p)))) for p in source.P]
                g.N = [L._unit(_mul(im, tuple(v/scale[i] for i, v in enumerate(_mul(m, n))))) for n in source.N]
                signature = hashlib.sha256(repr((mat, g.P, g.N, g.UV, g.I, g.C)).encode()).hexdigest()
                if signature in _MESH_CACHE:
                    mesh = _MESH_CACHE[signature]
                else:
                    a = Surface(surface.key, self.cat)
                    a.groups[(mat, tint, flags)] = g
                    temporary = L.build_objects(a, col)
                    mesh = temporary.children[0].data
                    mesh.name = 'substation-shared-' + signature[:12]
                    for child in list(temporary.children):
                        bpy.data.objects.remove(child, do_unlink=True)
                    bpy.data.objects.remove(temporary, do_unlink=True)
                    _MESH_CACHE[signature] = mesh
                name = surface.key + '-mesh-' + str(gi)
                ob = bpy.data.objects.new(name, mesh)
                col.objects.link(ob)
                ob.parent = parent
                if parent == root:
                    ob.location = L.to_blender(offset)

        create_surface(self.body, root)
        for part in self.parts:
            pivot = bpy.data.objects.new(self.key + '-' + part['name'], None)
            col.objects.link(pivot)
            pivot.parent = root
            pivot.location = L.to_blender(tuple(part['position'][i]*scale[i]+offset[i] for i in range(3)))
            # Convert game rotation to Blender via basis conjugation.
            from mathutils import Matrix
            game = Matrix(L._rotm(*part['rotation']))
            basis = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
            pivot.rotation_mode = 'QUATERNION'
            pivot.rotation_quaternion = (basis @ game @ basis.transposed()).to_quaternion()
            if part['name'] in self.cat.get('pivots', []):
                pivot['movable'] = True
            create_surface(part['surface'], pivot, part['rotation'])
        return root


def bar(a, mat, p, q, radius=.025, n=6):
    a.tube(mat, [p, q], radius, n=n, caps=True)


def plate(a, mat, x, y, z, w, h, normal=(0, 0, 1)):
    """Single textured plate, centre x/z with lower edge y."""
    p = [(x-w/2, y, z), (x+w/2, y, z), (x+w/2, y+h, z), (x-w/2, y+h, z)]
    a._emit(mat, (p, [normal]*4, [(0, 0), (1, 0), (1, 1), (0, 1)], [(0, 1, 2), (0, 2, 3)]))


def bolt(a, x, y, z, radius=.026):
    a.hcyl('substation_galvanised', x, y, z, radius, .02, axis='z', n=6)


def cabinet(a, w, h, d, lod, material='substation_paint', base=0):
    if lod:
        a.box(material, 0, base, 0, w, h, d)
    else:
        # True recessed cubicle: the separately hinged front door exposes an
        # interior volume rather than another coplanar painted box face.
        wall = .035
        a.box(material, 0, base, -d/2+wall/2, w, h, wall)
        for x in (-w/2+wall/2, w/2-wall/2):
            a.box(material, x, base, 0, wall, h, d)
        for y in (base, base+h-wall):
            a.box(material, 0, y, 0, w, wall, d)
    if not lod:
        a.box('substation_dark', 0, base+.07, -d/2+.04, w-.1, h-.14, .014)
        for x in (-w/2+.04, w/2-.04):
            for y in (base+.06, base+h-.06):
                bolt(a, x, y, d/2+.025, .018)


def door(assembly, suffix, hinge, w, h, lod, material='substation_paint', louvres=False):
    a = assembly.part(suffix, hinge)
    a.box(material, w/2, 0, 0, w, h, .035)
    # Keep the handle silhouette in both LODs; it defines the door envelope.
    a.box('substation_dark', w-.08, h*.44, .035, .035, .16, .045)
    if not lod:
        for y in (.12, h-.18):
            a.cyl('substation_galvanised', 0, y, 0, .025, .08, n=8)
        if louvres:
            for i in range(7):
                a.box('substation_dark', w/2, .12+i*.085, .02, w*.75, .028, .035)
    return a

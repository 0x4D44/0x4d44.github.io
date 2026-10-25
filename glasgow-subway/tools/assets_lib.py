"""Shared Blender (bpy) helpers for the Glasgow Subway asset builders (A3).
Blender frame: X east/right, Y north/forward, Z up.  glTF export (+Y up) maps Blender Y -> glTF -Z,
so "forward" in Blender (+Y) is the glTF -Z direction (train nose).  Units: metres.
Run via:  <venv>/bin/python tools/assets_build.py [train tunnel station misc]
"""
import bpy, bmesh, math, os, sys, struct, zlib
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'models')
SCRATCH = '/tmp/claude-0/-home-user/52020da6-bb97-5dd3-88b8-ef2e78784739/scratchpad/work'
os.makedirs(OUT, exist_ok=True); os.makedirs(SCRATCH, exist_ok=True)

# ---------------------------------------------------------------- materials
def hexc(h, a=1.0):
    h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), a)

# name: (hex, metal, rough, emissive hex or None, emit strength, alpha, texture key)
PALETTE = {
    'subway_orange':   ('#e8661a', 0.0, 0.35, None, 0, 1, None),
    'subway_orange_dk':('#b24a10', 0.0, 0.5, None, 0, 1, None),
    'livery_grey':     ('#4b4f55', 0.2, 0.5, None, 0, 1, None),
    'livery_white':    ('#e9e6df', 0.0, 0.4, None, 0, 1, None),
    'roundel_blue':    ('#1b3f8f', 0.0, 0.4, None, 0, 1, None),
    'glass_window':    ('#1c2b36', 0.0, 0.05, None, 0, 0.38, None),
    'glass_clear':     ('#a8c4d0', 0.0, 0.05, None, 0, 0.25, None),
    'headlight':       ('#fffbe8', 0.0, 0.2, '#fff6d8', 12, 1, None),
    'taillight':       ('#aa0000', 0.0, 0.3, '#ff1010', 6, 1, None),
    'strip_light':     ('#ffffff', 0.0, 0.3, '#f4f8ff', 5, 1, None),
    'lamp_warm':       ('#ffe2a8', 0.0, 0.3, '#ffcf80', 5, 1, None),
    'steel_dark':      ('#2c2f33', 0.7, 0.45, None, 0, 1, None),
    'steel_bright':    ('#a9adb3', 0.9, 0.3, None, 0, 1, None),
    'rail_steel':      ('#6c625a', 0.9, 0.4, None, 0, 1, None),
    'conductor_rail':  ('#7d7f84', 0.9, 0.35, None, 0, 1, None),
    'rubber_black':    ('#141414', 0.0, 0.8, None, 0, 1, None),
    'plastic_grey':    ('#6d7076', 0.0, 0.55, None, 0, 1, None),
    'plastic_black':   ('#1b1c1e', 0.0, 0.5, None, 0, 1, None),
    'seat_fabric':     ('#d4571a', 0.0, 0.9, None, 0, 1, None),
    'seat_fabric_dk':  ('#3b3e46', 0.0, 0.9, None, 0, 1, None),
    'floor_grey':      ('#55585d', 0.0, 0.8, None, 0, 1, None),
    'interior_wall':   ('#d9d6cc', 0.0, 0.6, None, 0, 1, None),
    'interior_ceiling':('#eeeae0', 0.0, 0.6, None, 0, 1, None),
    'pole_yellow':     ('#e8b50c', 0.3, 0.4, None, 0, 1, None),
    'screen_off':      ('#07090b', 0.0, 0.2, '#0b2030', 0.6, 1, None),
    'screen_blank':    ('#ffffff', 0.0, 0.3, '#ffffff', 1.0, 1, 'blank'),
    'button_green':    ('#18b34a', 0.0, 0.4, '#18b34a', 1.5, 1, None),
    'button_red':      ('#d11c1c', 0.0, 0.4, '#d11c1c', 1.5, 1, None),
    'button_amber':    ('#f0a000', 0.0, 0.4, '#f0a000', 1.5, 1, None),
    # tunnel / station
    'cast_iron':       ('#4a4743', 0.6, 0.65, None, 0, 1, 'iron'),
    'concrete_lining': ('#8a877f', 0.0, 0.9, None, 0, 1, 'concrete'),
    'concrete_dark':   ('#4f4d49', 0.0, 0.95, None, 0, 1, 'concrete'),
    'track_ballast':   ('#3a3834', 0.0, 1.0, None, 0, 1, 'concrete'),
    'sleeper':         ('#6e6a63', 0.0, 0.95, None, 0, 1, 'concrete'),
    'platform_stone':  ('#7b7870', 0.0, 0.85, None, 0, 1, 'concrete'),
    'platform_floor':  ('#9a968c', 0.0, 0.7, None, 0, 1, 'flags'),
    'tactile_yellow':  ('#e9c200', 0.0, 0.6, None, 0, 1, 'tactile'),
    'edge_white':      ('#e8e8e0', 0.0, 0.6, None, 0, 1, None),
    'tile_cream':      ('#e6dcc0', 0.0, 0.25, None, 0, 1, 'tile'),
    'tile_orange':     ('#e8661a', 0.0, 0.25, None, 0, 1, 'tile'),
    'tile_brown':      ('#6b4a30', 0.0, 0.3, None, 0, 1, 'tile'),
    'tile_white':      ('#f2efe6', 0.0, 0.25, None, 0, 1, 'tile'),
    'panel_ceiling':   ('#cfcdc6', 0.0, 0.7, None, 0, 1, None),
    'paint_cream':     ('#d9cfae', 0.0, 0.75, None, 0, 1, None),
    'paint_green':     ('#2f5a45', 0.0, 0.6, None, 0, 1, None),
    'sign_blank':      ('#ffffff', 0.0, 0.5, '#ffffff', 0.35, 1, 'blank'),
    'sign_orange':     ('#e8661a', 0.0, 0.45, '#e8661a', 0.6, 1, None),
    'sign_white':      ('#f4f2ea', 0.0, 0.45, None, 0, 1, None),
    'sign_blue':       ('#1a4fa0', 0.0, 0.45, None, 0, 1, None),
    'sign_green':      ('#0f8a3c', 0.0, 0.45, '#0f8a3c', 0.5, 1, None),
    'sign_red':        ('#c4161c', 0.0, 0.45, None, 0, 1, None),
    'sign_yellow':     ('#f2c200', 0.0, 0.45, None, 0, 1, None),
    'wood_bench':      ('#8a5a2e', 0.0, 0.6, None, 0, 1, None),
    'brick_red':       ('#8a3f2c', 0.0, 0.9, None, 0, 1, 'brick'),
    'sandstone':       ('#c7a574', 0.0, 0.9, None, 0, 1, 'concrete'),
    'roof_slate':      ('#4b5360', 0.0, 0.8, None, 0, 1, None),
    'roof_metal':      ('#7e8a8f', 0.5, 0.5, None, 0, 1, None),
    'asphalt':         ('#34363a', 0.0, 0.95, None, 0, 1, 'concrete'),
    'grass':           ('#52703a', 0.0, 1.0, None, 0, 1, None),
    'door_blue':       ('#1d3f7a', 0.2, 0.5, None, 0, 1, None),
    'skin_a':          ('#e0ac8c', 0.0, 0.8, None, 0, 1, None),
    'skin_b':          ('#8d5a3c', 0.0, 0.8, None, 0, 1, None),
    'skin_c':          ('#f0cfae', 0.0, 0.8, None, 0, 1, None),
    'cloth_navy':      ('#23304a', 0.0, 0.9, None, 0, 1, None),
    'cloth_red':       ('#a52a2a', 0.0, 0.9, None, 0, 1, None),
    'cloth_green':     ('#3c6b45', 0.0, 0.9, None, 0, 1, None),
    'cloth_grey':      ('#6b6e72', 0.0, 0.9, None, 0, 1, None),
    'cloth_tan':       ('#b59a72', 0.0, 0.9, None, 0, 1, None),
    'cloth_black':     ('#1e1e22', 0.0, 0.9, None, 0, 1, None),
    'cloth_white':     ('#dcdcd8', 0.0, 0.9, None, 0, 1, None),
    'hair_dark':       ('#2a1d14', 0.0, 0.9, None, 0, 1, None),
    'hair_blond':      ('#c9a24d', 0.0, 0.9, None, 0, 1, None),
    'hair_grey':       ('#9a9a9a', 0.0, 0.9, None, 0, 1, None),
    'hivis':           ('#d6ee1a', 0.0, 0.7, None, 0, 1, None),
}

_matcache = {}
_texcache = {}

def png_bytes(w, h, px):
    raw = b''.join(b'\x00' + bytes(px[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    def ch(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw, 9)) + ch(b'IEND', b'')

def make_tex(key):
    """Small procedural greyscale-ish detail textures (multiplied with base colour)."""
    if key in _texcache: return _texcache[key]
    import random
    rnd = random.Random(hash(key) & 0xffff)
    S = 128; px = bytearray(S * S * 4)
    def put(x, y, v):
        i = (y * S + x) * 4; px[i] = px[i+1] = px[i+2] = max(0, min(255, int(v))); px[i+3] = 255
    for y in range(S):
        for x in range(S):
            v = 255
            if key == 'tile':          # 16 x 16 tile grid over 128px = glossy tiles w/ grout (0.15 m tile if 1uv=1.2m)
                tx, ty = x % 16, y % 16
                v = 215 if (tx == 0 or ty == 0) else 245 + (hash((x // 16, y // 16)) % 10) - 5
                if tx in (1,) or ty in (1,): v = 255
            elif key == 'concrete':
                v = 215 + rnd.random() * 40
            elif key == 'iron':
                v = 200 + rnd.random() * 30
            elif key == 'flags':       # paving flags 4x4 across
                tx, ty = x % 32, y % 32
                v = 190 if (tx == 0 or ty == 0) else 232 + rnd.random() * 20
            elif key == 'tactile':     # raised dots grid
                tx, ty = x % 16, y % 16
                d = (tx - 8) ** 2 + (ty - 8) ** 2
                v = 255 if d < 20 else 170
            elif key == 'brick':
                row = y // 8; off = 8 if row % 2 else 0
                v = 170 if (y % 8 == 0 or (x + off) % 16 == 0) else 225 + rnd.random() * 30
            elif key == 'blank':
                v = 255
            put(x, y, v)
    path = os.path.join(SCRATCH, f'tex_{key}.png')
    open(path, 'wb').write(png_bytes(S, S, px))
    img = bpy.data.images.load(path); img.pack(); img.name = f'tex_{key}'
    _texcache[key] = img
    return img

def mat(name):
    if name in _matcache: return _matcache[name]
    hx, metal, rough, em, es, alpha, tex = PALETTE[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = hexc(hx)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    if em:
        bs.inputs['Emission Color'].default_value = hexc(em); bs.inputs['Emission Strength'].default_value = es
    if alpha < 1:
        bs.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = make_tex(tex); t.interpolation = 'Linear'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = hexc(hx)
        nt.links.new(t.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bs.inputs['Base Color'])
    _matcache[name] = m
    return m

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _matcache.clear(); _texcache.clear()

# ---------------------------------------------------------------- mesh builder
class M:
    """Accumulates geometry into one bmesh; each call takes a material name."""
    def __init__(self):
        self.bm = bmesh.new(); self.mats = []
    def _mi(self, name):
        if name not in self.mats: self.mats.append(name)
        return self.mats.index(name)
    def _tag(self, faces, name):
        i = self._mi(name)
        for f in faces: f.material_index = i
    def box(self, c, s, m, rot=None):
        """centre c, full size s (x,y,z) ; rot optional euler (rad) about centre."""
        mx = Matrix.Translation(Vector(c))
        if rot: mx = mx @ Matrix(__import__('mathutils').Euler(rot).to_matrix()).to_4x4()
        mx = mx @ Matrix.Diagonal(Vector((s[0], s[1], s[2], 1.0)))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=mx)
        self._tag({f for v in r['verts'] for f in v.link_faces}, m)
    def bbox(self, a, b, m):
        """box from min corner a to max corner b."""
        self.box(((a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2), (abs(b[0]-a[0]), abs(b[1]-a[1]), abs(b[2]-a[2])), m)
    def cyl(self, c, r, h, m, axis='z', seg=12, r2=None):
        rot = {'z': Matrix.Identity(4), 'x': Matrix.Rotation(math.pi/2, 4, 'Y'), 'y': Matrix.Rotation(-math.pi/2, 4, 'X')}[axis]
        mx = Matrix.Translation(Vector(c)) @ rot
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=(r if r2 is None else r2), depth=h, matrix=mx)
        self._tag({f for v in res['verts'] for f in v.link_faces}, m)
    def sphere(self, c, r, m, sx=1, sy=1, sz=1, seg=10):
        mx = Matrix.Translation(Vector(c)) @ Matrix.Diagonal(Vector((sx, sy, sz, 1)))
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(4, seg // 2), radius=r, matrix=mx)
        self._tag({f for v in res['verts'] for f in v.link_faces}, m)
    def quad(self, p0, p1, p2, p3, m):
        vs = [self.bm.verts.new(Vector(p)) for p in (p0, p1, p2, p3)]
        f = self.bm.faces.new(vs); self._tag([f], m); return f
    def quad_uv(self, p0, p1, p2, p3, m):
        """Quad with UV (0,0)-(1,1) across its corners p0=BL p1=BR p2=TR p3=TL (for runtime canvas textures)."""
        f = self.quad(p0, p1, p2, p3, m)
        uvl = self.bm.loops.layers.uv.verify()
        for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv
        f.tag = True
        return f
    def poly(self, pts, m):
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        f = self.bm.faces.new(vs); self._tag([f], m); return f
    def prism_y(self, prof, y0, y1, m, cap=True):
        """Extrude 2D profile prof=[(x,z)...] (CCW seen from +Y... any winding; normals recalculated) from y0 to y1 along Y."""
        n = len(prof)
        a = [self.bm.verts.new((x, y0, z)) for x, z in prof]
        b = [self.bm.verts.new((x, y1, z)) for x, z in prof]
        fs = []
        for i in range(n):
            j = (i + 1) % n
            fs.append(self.bm.faces.new((a[i], a[j], b[j], b[i])))
        if cap:
            fs.append(self.bm.faces.new(a)); fs.append(self.bm.faces.new(b[::-1]))
        self._tag(fs, m)
    def prism_x(self, prof, x0, x1, m, cap=True):
        """Extrude profile [(y,z)...] along X."""
        n = len(prof)
        a = [self.bm.verts.new((x0, y, z)) for y, z in prof]
        b = [self.bm.verts.new((x1, y, z)) for y, z in prof]
        fs = [self.bm.faces.new((a[i], a[(i+1) % n], b[(i+1) % n], b[i])) for i in range(n)]
        if cap:
            fs.append(self.bm.faces.new(a)); fs.append(self.bm.faces.new(b[::-1]))
        self._tag(fs, m)
    def strip_y(self, prof, y0, y1, m, closed=False, flip=False):
        """Open (or closed) extruded polyline surface (no caps), profile (x,z)."""
        n = len(prof); fs = []
        a = [self.bm.verts.new((x, y0, z)) for x, z in prof]
        b = [self.bm.verts.new((x, y1, z)) for x, z in prof]
        rng = n if closed else n - 1
        for i in range(rng):
            j = (i + 1) % n
            q = (a[i], a[j], b[j], b[i])
            fs.append(self.bm.faces.new(q[::-1] if flip else q))
        self._tag(fs, m)
    def to_obj(self, name, parent=None, loc=(0, 0, 0), uv=True, smooth=False, collection=None):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if uv: auto_uv(bm)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for mn in self.mats: me.materials.append(mat(mn))
        if smooth:
            for p in me.polygons: p.use_smooth = True
        o = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(o)
        o.location = loc
        if parent: o.parent = parent
        return o

def auto_uv(bm, scale=1.0):
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        if f.tag: continue
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = l.vert.co
            if ax == 0: u, v = p.y, p.z
            elif ax == 1: u, v = p.x, p.z
            else: u, v = p.x, p.y
            l[uvl].uv = (u * scale, v * scale)

def empty(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0), kind='PLAIN_AXES', size=0.1):
    e = bpy.data.objects.new(name, None); e.empty_display_type = kind; e.empty_display_size = size
    bpy.context.scene.collection.objects.link(e)
    e.location = loc; e.rotation_euler = rot
    if parent: e.parent = parent
    return e

def group(name, loc=(0, 0, 0), parent=None):
    return empty(name, loc, parent, kind='ARROWS', size=0.3)

def tri_count(objs=None):
    n = 0
    for o in (objs or bpy.data.objects):
        if o.type == 'MESH':
            n += sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)
    return n

def export(fname, extra_info=None):
    path = os.path.join(OUT, fname)
    bpy.ops.object.select_all(action='DESELECT')
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
              export_materials='EXPORT', export_image_format='AUTO', export_cameras=False,
              export_lights=False, export_extras=False)
    try:
        bpy.ops.export_scene.gltf(**kw, export_texcoords=True, export_normals=True)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    sz = os.path.getsize(path)
    print(f'EXPORTED {fname}: {sz/1024:.0f} KB, {tri_count()} tris, {len(bpy.data.objects)} nodes')
    return sz

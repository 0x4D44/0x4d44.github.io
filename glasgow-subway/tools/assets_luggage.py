"""Luggage for the crowd, made in Blender:  models/luggage.glb

    python tools/assets_luggage.py [out.glb]          (a Python with the `bpy` module, Blender 4.2+)

Eight things people take on the train.  Blender axes: x across, y depth, z up (the exporter turns
that into glTF's y up, Blender +y -> glTF -z).  Every object is one mesh with a few material slots:

    lug_main    the cloth or shell: white here, tinted per bag by js/sim/bags.js
    lug_second  panels a shade darker than the main colour (tinted too)
    lug_trim    black webbing, zips, rubber bumpers
    lug_metal   buckles, the trolley's tubes
    lug_wheel   tyres

Origins (what bags.js relies on):
    trolley_*          the floor under the middle of the wheels; the pull handle is a second object,
                       trolley_*_handle, modelled pulled OUT, to be slid down by `extras.travel` to stow it
    holdall, handbag,  the top of the handles (where the hand holds it), the bag below; thin across x,
    shopper, satchel   long along y
    ruck_*             the bottom middle of the face that lies on the wearer's back; the bag is at +y.
                       Modelled W 0.30 x H 0.45 x D 0.16 and scaled to the wearer by bags.js
"""
import bpy, bmesh, sys, math, os
from mathutils import Vector, Matrix

OUT = sys.argv[-1] if sys.argv[-1].endswith('.glb') else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'luggage.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


def mat(name, rgb, rough, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m


M = {
    'main': mat('lug_main', (1, 1, 1), 0.7), 'second': mat('lug_second', (0.62, 0.62, 0.62), 0.8),
    'trim': mat('lug_trim', (0.012, 0.012, 0.014), 0.75), 'metal': mat('lug_metal', (0.62, 0.63, 0.65), 0.32, 0.9),
    'wheel': mat('lug_wheel', (0.008, 0.008, 0.008), 0.9),
}


def obj_from(bm, name, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); SC.collection.objects.link(o); me.materials.append(M[m]); return o


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for o2 in SC.objects: o2.select_set(o2 is o)
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)


def box(name, m, size, at, bevel=0.0, seg=2, taper=None):
    """a box, size (x, y, z) centred at `at`, edges rounded by `bevel`; taper = (kx, ky): the top face scaled by that much"""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        k = taper if (taper and v.co.z > 0) else (1, 1)
        v.co = Vector((v.co.x * size[0] * k[0], v.co.y * size[1] * k[1], v.co.z * size[2]))
    o = obj_from(bm, name, m); o.location = at
    if bevel > 0:
        b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; apply_mods(o)
    return o


def cyl(name, m, r, depth, at, axis='x', seg=14, bevel=0.0):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    o = obj_from(bm, name, m); o.location = at
    o.rotation_euler = {'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0), 'z': (0, 0, 0)}[axis]
    if bevel > 0:
        b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'; apply_mods(o)
    return o


def tube(name, m, pts, r, res=6, flat=None, smooth=True):
    """a tube (or, with flat = (w, t), a strap) along a smooth curve through pts"""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.resolution_u = 5
    sp = cu.splines.new('NURBS' if smooth else 'POLY'); sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts): p.co = (*q, 1)
    if smooth: sp.use_endpoint_u = True; sp.order_u = min(4, len(pts))
    if flat:
        cu.extrude = flat[0] / 2; so = cu.modifiers if False else None
        o = bpy.data.objects.new(name, cu); SC.collection.objects.link(o)
        s = o.modifiers.new('s', 'SOLIDIFY'); s.thickness = flat[1]; s.offset = 0
    else:
        cu.bevel_depth = r; cu.bevel_resolution = max(0, res // 4); cu.use_fill_caps = True
        o = bpy.data.objects.new(name, cu); SC.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    for o2 in SC.objects: o2.select_set(o2 is o)
    bpy.ops.object.convert(target='MESH'); o = bpy.context.view_layer.objects.active
    apply_mods(o); o.data.materials.clear(); o.data.materials.append(M[m]); return o


def loft(name, m, rings, cap=True):
    """a skin over closed rings (each a list of (x, y, z), the same count), capped at both ends"""
    bm = bmesh.new(); vs = [[bm.verts.new(p) for p in r] for r in rings]; n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap: bm.faces.new(list(reversed(vs[0]))); bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from(bm, name, m)


def rring(cx, cy, z, a, b, r, n=4):
    """a rounded rectangle in the plane z: half sizes a (x), b (y), corner radius r, n points a corner"""
    r = min(r, a, b); out = []
    for q, (sx, sy) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
        for k in range(n):
            t = (q + k / (n - 1)) * math.pi / 2
            out.append((cx + sx * (a - r) + r * math.cos(t), cy + sy * (b - r) + r * math.sin(t), z))
    return out


def join(name, parts, origin=(0, 0, 0), angle=38, extras=None):
    for o in SC.objects: o.select_set(o in parts)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = bpy.context.view_layer.objects.active
    o.name = name; o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.transform(Matrix.Translation(-Vector(origin)))
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
    for p in o.data.polygons: p.use_smooth = True
    o.data.set_sharp_from_angle(angle=math.radians(angle))
    if extras:
        for k, v in extras.items(): o[k] = v
    return o


# ------------------------------------------------------------------------------------------------ wheeled suitcases
def trolley(name, W, H, D, wheel=0.027):
    """a hard-shell spinner case: W across (x), H tall, D deep (y); the pull handle rises from the back (-y)"""
    z0 = wheel * 2 + 0.006; parts = []
    parts.append(box(name + '_shell', 'main', (W, D, H), (0, 0, z0 + H / 2), bevel=min(W, D) * 0.2, seg=3))
    # the ribs moulded into both faces, and the zip that runs round the middle
    for sy in (1, -1):
        for k in range(5):
            x = (k - 2) * W * 0.16
            parts.append(box(f'{name}_rib', 'second', (W * 0.055, 0.008, H * 0.7), (x, sy * (D / 2 + 0.001), z0 + H * 0.5), bevel=0.003, seg=1))
    parts.append(box(name + '_zip', 'trim', (W + 0.004, 0.012, H + 0.004), (0, D * 0.08, z0 + H / 2), bevel=min(W, D) * 0.2, seg=3))
    # carry handles: top and one side
    hx = W * 0.2
    parts.append(tube(name + '_tophandle', 'trim', [(-hx, 0.02, z0 + H - 0.004), (-hx * 0.8, 0.02, z0 + H + 0.026), (hx * 0.8, 0.02, z0 + H + 0.026), (hx, 0.02, z0 + H - 0.004)], 0.008))
    parts.append(tube(name + '_sidehandle', 'trim', [(W / 2 - 0.004, 0.02, z0 + H * 0.5 - hx), (W / 2 + 0.024, 0.02, z0 + H * 0.5 - hx * 0.8), (W / 2 + 0.024, 0.02, z0 + H * 0.5 + hx * 0.8), (W / 2 - 0.004, 0.02, z0 + H * 0.5 + hx)], 0.008))
    # four castors: a fork and twin wheels at each corner
    for sx in (1, -1):
        for sy in (1, -1):
            cx, cy = sx * (W / 2 - 0.045), sy * (D / 2 - 0.04)
            parts.append(box(name + '_fork', 'trim', (0.03, 0.036, 0.03), (cx, cy, z0 - 0.008), bevel=0.006, seg=1))
            for t in (-1, 1):
                parts.append(cyl(name + '_wheel', 'wheel', wheel, 0.011, (cx + t * 0.011, cy, wheel), axis='x', seg=12, bevel=0.003))
    # the sockets the pull handle slides in, and a lock on the side
    tx = W * 0.2
    parts.append(box(name + '_socket', 'trim', (tx * 2 + 0.05, 0.03, 0.012), (0, -D / 2 + 0.03, z0 + H + 0.003), bevel=0.004, seg=1))
    parts.append(box(name + '_lock', 'metal', (0.008, 0.04, 0.022), (-W / 2 - 0.001, D * 0.08, z0 + H * 0.62), bevel=0.002, seg=1))
    body = join(name, parts, extras={'w': W, 'h': z0 + H, 'd': D})
    # the pull handle, out: two tubes and a grip.  travel = how far it slides down to stow
    top = max(0.92, z0 + H + 0.2) if H < 0.6 else z0 + H + 0.3
    travel = top - (z0 + H + 0.03); hp = []
    for sx in (1, -1):
        hp.append(box(name + '_tube', 'metal', (0.018, 0.012, travel + 0.14), (sx * tx, -D / 2 + 0.03, top - 0.012 - (travel + 0.14) / 2), bevel=0.003, seg=1))
    hp.append(box(name + '_grip', 'trim', (tx * 2 + 0.04, 0.026, 0.026), (0, -D / 2 + 0.03, top - 0.013), bevel=0.009, seg=2))
    join(name + '_handle', hp, extras={'travel': travel, 'grip': top - 0.013, 'gripY': -D / 2 + 0.03})
    return body


# ------------------------------------------------------------------------------------------------ bags carried in the hand
def holdall():
    """a sports holdall: a barrel 0.50 long (y), carried by two webbing handles that meet over the middle"""
    L, R, Rz, drop = 0.50, 0.125, 0.115, 0.17; zc = -(drop + Rz)   # the barrel's axis
    rings = []
    for t, k in [(-0.5, 0.55), (-0.47, 0.86), (-0.4, 1), (0, 1.02), (0.4, 1), (0.47, 0.86), (0.5, 0.55)]:
        ring = []
        for i in range(14):
            a = i / 14 * 2 * math.pi; sx, sz = math.cos(a), math.sin(a)
            flat = 0.82 if sz < -0.3 else 1          # it sits flat on its base
            ring.append((R * k * sx, L * t, zc + Rz * k * sz * flat))
        rings.append(ring)
    parts = [loft('holdall_body', 'main', rings)]
    parts.append(box('holdall_zip', 'trim', (0.018, L * 0.8, 0.008), (0, 0, zc + Rz * 1.0), bevel=0.003, seg=1))
    for sy in (1, -1):   # end pockets
        parts.append(box('holdall_end', 'second', (R * 1.2, 0.014, Rz * 1.1), (0, sy * L * 0.492, zc - 0.005), bevel=0.02, seg=2))
    for sx in (1, -1):   # each handle: up one side, over to the grip, down again; and the band it is sewn to
        for sy in (1, -1):
            parts.append(box('holdall_band', 'trim', (0.004, 0.034, Rz * 1.5), (sx * R * 1.0, sy * L * 0.17, zc - Rz * 0.05), bevel=0.0))
        parts.append(tube('holdall_handle', 'trim', [(sx * R * 0.98, -L * 0.17, zc + Rz * 0.55), (sx * R * 0.7, -L * 0.15, zc + Rz * 1.25), (sx * 0.012, -L * 0.07, -0.004),
                                                     (sx * 0.012, L * 0.07, -0.004), (sx * R * 0.7, L * 0.15, zc + Rz * 1.25), (sx * R * 0.98, L * 0.17, zc + Rz * 0.55)], 0, flat=(0.03, 0.004)))
    parts.append(box('holdall_wrap', 'second', (0.05, 0.1, 0.03), (0, 0, -0.012), bevel=0.012, seg=2))   # the grip wrap round both handles
    return join('holdall', parts, extras={'w': R * 2, 'h': Rz * 2, 'd': L, 'drop': drop})


def handbag():
    """a structured handbag: 0.30 long, 0.21 tall, 0.11 thick, narrower at the top, two arched handles"""
    L, Hh, T, drop = 0.30, 0.21, 0.11, 0.13; zt = -drop; zb = zt - Hh
    rings = [rring(0, 0, zb, T * 0.5, L * 0.5, 0.03), rring(0, 0, zb + 0.02, T * 0.52, L * 0.51, 0.03), rring(0, 0, zt - 0.03, T * 0.36, L * 0.46, 0.025), rring(0, 0, zt, T * 0.26, L * 0.44, 0.02)]
    parts = [loft('handbag_body', 'main', rings)]
    parts.append(box('handbag_flap', 'second', (T * 0.6, L * 0.5, 0.07), (0, 0, zt - 0.03), bevel=0.012, seg=2))
    parts.append(box('handbag_clasp', 'metal', (T * 0.64, 0.03, 0.022), (0, 0, zt - 0.062), bevel=0.004, seg=1))
    for sx in (1, -1):
        x = sx * T * 0.2
        parts.append(tube('handbag_handle', 'second', [(x, -L * 0.24, zt - 0.005), (x * 0.8, -L * 0.2, zt + drop * 0.7), (sx * 0.008, -L * 0.07, 0), (sx * 0.008, L * 0.07, 0), (x * 0.8, L * 0.2, zt + drop * 0.7), (x, L * 0.24, zt - 0.005)], 0.006))
        for sy in (1, -1): parts.append(cyl('handbag_ring', 'metal', 0.011, 0.005, (x, sy * L * 0.24, zt - 0.004), axis='x', seg=10))
    for sy in (1, -1):   # feet
        for sx in (1, -1): parts.append(cyl('handbag_foot', 'metal', 0.006, 0.006, (sx * T * 0.3, sy * L * 0.4, zb - 0.002), axis='z', seg=8))
    return join('handbag', parts, extras={'w': T, 'h': Hh, 'd': L, 'drop': drop})


def shopper():
    """a stiff paper carrier with rope handles, open at the top"""
    L, Hh, T, drop = 0.30, 0.36, 0.12, 0.12; zt = -drop; zb = zt - Hh
    bm = bmesh.new(); r0 = [bm.verts.new(p) for p in rring(0, 0, zb, T / 2, L / 2, 0.006, 2)]; r1 = [bm.verts.new(p) for p in rring(0, 0, zt, T / 2 * 1.08, L / 2 * 1.02, 0.006, 2)]
    r2 = [bm.verts.new(p) for p in rring(0, 0, zt - 0.03, T / 2 * 0.9, L / 2 * 0.97, 0.006, 2)]   # the inside, a little way down
    n = len(r0)
    for i in range(n): bm.faces.new((r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i])); bm.faces.new((r1[i], r1[(i + 1) % n], r2[(i + 1) % n], r2[i]))
    bm.faces.new(list(reversed(r0))); top = bm.faces.new(r2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = obj_from(bm, 'shopper_body', 'main'); body.data.materials.append(M['second'])
    for p in body.data.polygons:
        if abs(p.normal.z) > 0.9 and p.center.z > zt - 0.05: p.material_index = 1
    parts = [body]
    parts.append(box('shopper_band', 'second', (T * 1.09 + 0.002, L * 1.03 + 0.002, 0.07), (0, 0, zt - Hh * 0.45), bevel=0.0))   # a printed band round it
    for sx in (1, -1):
        x = sx * T * 0.5
        parts.append(tube('shopper_rope', 'trim', [(x, -L * 0.2, zt - 0.02), (x, -L * 0.2, zt + 0.02), (sx * 0.006, -L * 0.08, -0.002), (sx * 0.006, L * 0.08, -0.002), (x, L * 0.2, zt + 0.02), (x, L * 0.2, zt - 0.02)], 0.004))
    return join('shopper', parts, extras={'w': T, 'h': Hh, 'd': L, 'drop': drop}, angle=30)


def satchel():
    """a laptop satchel / briefcase with a flap, two buckles and a top handle"""
    L, Hh, T, drop = 0.40, 0.29, 0.085, 0.05; zt = -drop; zb = zt - Hh
    parts = [box('satchel_body', 'main', (T, L, Hh), (0, 0, zt - Hh / 2), bevel=0.018, seg=2)]
    parts.append(box('satchel_flap', 'second', (T * 0.55, L * 1.01, Hh * 0.62), (T * 0.26, 0, zt - Hh * 0.3), bevel=0.014, seg=2))
    parts.append(box('satchel_lid', 'second', (T * 1.03, L * 1.01, 0.02), (0, 0, zt - 0.008), bevel=0.008, seg=2))
    for sy in (1, -1):
        parts.append(box('satchel_strap', 'trim', (0.006, 0.032, Hh * 0.7), (T / 2 + 0.008, sy * L * 0.27, zt - Hh * 0.36), bevel=0.0))
        parts.append(box('satchel_buckle', 'metal', (0.008, 0.042, 0.03), (T / 2 + 0.012, sy * L * 0.27, zt - Hh * 0.6), bevel=0.003, seg=1))
        parts.append(cyl('satchel_dring', 'metal', 0.012, 0.006, (0, sy * (L / 2 + 0.004), zt - 0.03), axis='y', seg=10))
    parts.append(tube('satchel_handle', 'trim', [(0, -L * 0.16, zt), (0, -L * 0.14, zt + drop * 0.9), (0, -L * 0.06, 0), (0, L * 0.06, 0), (0, L * 0.14, zt + drop * 0.9), (0, L * 0.16, zt)], 0.009))
    return join('satchel', parts, extras={'w': T, 'h': Hh, 'd': L, 'drop': drop})


# ------------------------------------------------------------------------------------------------ rucksacks (the body only: bags.js makes the straps to fit each wearer)
def ruck(name, hike):
    W, H, D = 0.30, 0.45, 0.16
    prof = [(0, 0.74, 0.6), (0.05, 0.93, 0.9), (0.28, 1, 1), (0.68, 0.97, 0.94), (0.9, 0.82, 0.72), (1, 0.5, 0.38)] if not hike else [(0, 0.8, 0.7), (0.06, 0.96, 0.95), (0.3, 1, 1), (0.74, 0.98, 1), (0.8, 0.95, 0.96)]
    rings = []
    for t, a, b in prof:
        hw, hd = W / 2 * a, D / 2 * b; rings.append(rring(0, hd, t * H, hw, hd, min(hw, hd) * 0.7))
    parts = [loft(name + '_body', 'main', rings)]
    if hike:
        # the lid: a cap that overhangs the top, held down by two straps with buckles; a bedroll strapped underneath
        parts.append(loft(name + '_lid', 'second', [rring(0, D * 0.5, H * 0.78, W * 0.5, D * 0.54, 0.05), rring(0, D * 0.5, H * 0.9, W * 0.5, D * 0.55, 0.06), rring(0, D * 0.48, H * 0.99, W * 0.4, D * 0.42, 0.06), rring(0, D * 0.46, H * 1.02, W * 0.22, D * 0.22, 0.05)]))
        for sx in (1, -1):
            parts.append(box(name + '_lidstrap', 'trim', (0.022, 0.005, H * 0.4), (sx * W * 0.2, D * 1.0, H * 0.62), bevel=0.0))
            parts.append(box(name + '_buckle', 'metal', (0.03, 0.01, 0.022), (sx * W * 0.2, D * 1.01, H * 0.56), bevel=0.003, seg=1))
            parts.append(box(name + '_rollstrap', 'trim', (0.02, D * 0.62, 0.006), (sx * W * 0.26, D * 0.5, -0.062), bevel=0.0))
            parts.append(loft(name + '_side', 'second', [rring(sx * W * 0.5, D * 0.5, H * 0.1, 0.03, D * 0.3, 0.03), rring(sx * W * 0.5, D * 0.5, H * 0.34, 0.034, D * 0.3, 0.03), rring(sx * W * 0.5, D * 0.5, H * 0.38, 0.012, D * 0.24, 0.012)]))
        parts.append(cyl(name + '_roll', 'second', 0.058, W * 1.12, (0, D * 0.5, -0.06), axis='x', seg=14, bevel=0.008))
        parts.append(loft(name + '_pocket', 'second', [rring(0, D * 0.98, H * 0.1, W * 0.3, D * 0.14, 0.03), rring(0, D * 0.98, H * 0.42, W * 0.31, D * 0.16, 0.03), rring(0, D * 0.98, H * 0.46, W * 0.26, D * 0.08, 0.02)]))
    else:
        parts.append(loft(name + '_pocket', 'second', [rring(0, D * 0.97, H * 0.07, W * 0.29, D * 0.2, D * 0.12), rring(0, D * 0.97, H * 0.12, W * 0.38, D * 0.2, D * 0.12), rring(0, D * 0.97, H * 0.42, W * 0.39, D * 0.2, D * 0.12), rring(0, D * 0.97, H * 0.5, W * 0.3, D * 0.2, D * 0.12)]))
        parts.append(box(name + '_zip', 'trim', (W * 0.6, 0.006, 0.008), (0, D * 1.17, H * 0.4), bevel=0.0))
        # the main zip, an arc over the top; a bottle in a mesh side pocket
        parts.append(tube(name + '_mainzip', 'trim', [(-W * 0.47, D * 0.62, H * 0.5), (-W * 0.45, D * 0.6, H * 0.8), (-W * 0.25, D * 0.5, H * 0.985), (W * 0.25, D * 0.5, H * 0.985), (W * 0.45, D * 0.6, H * 0.8), (W * 0.47, D * 0.62, H * 0.5)], 0.005))
        parts.append(loft(name + '_side', 'trim', [rring(W * 0.5, D * 0.5, H * 0.08, 0.03, D * 0.26, 0.03), rring(W * 0.5, D * 0.5, H * 0.3, 0.036, D * 0.26, 0.03)]))
        parts.append(cyl(name + '_bottle', 'metal', 0.032, H * 0.36, (W * 0.5 + 0.006, D * 0.5, H * 0.3), axis='z', seg=12, bevel=0.006))
        parts.append(cyl(name + '_cap', 'second', 0.02, 0.03, (W * 0.5 + 0.006, D * 0.5, H * 0.495), axis='z', seg=10))
    hw = W * 0.1; hy = D * 0.16
    parts.append(tube(name + '_grab', 'trim', [(-hw, hy, H * (0.8 if hike else 0.985) - 0.012), (-hw * 0.6, hy, H * (0.8 if hike else 0.985) + 0.03), (hw * 0.6, hy, H * (0.8 if hike else 0.985) + 0.03), (hw, hy, H * (0.8 if hike else 0.985) - 0.012)], 0, flat=(0.022, 0.005)))
    return join(name, parts, extras={'w': W, 'h': H, 'd': D})


made = [trolley('trolley_cabin', 0.36, 0.50, 0.22), trolley('trolley_large', 0.45, 0.66, 0.27), holdall(), handbag(), shopper(), satchel(), ruck('ruck_day', False), ruck('ruck_hike', True)]
tris = {o.name: len(o.data.polygons) for o in SC.objects}
for o in SC.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_animations=False, export_materials='EXPORT', export_normals=True, export_texcoords=False)
print('LUGGAGE', os.path.abspath(OUT), os.path.getsize(OUT), 'bytes', tris)

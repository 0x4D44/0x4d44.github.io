"""Blender (Cycles, CPU) previews of the FINAL people GLB: imports the glb, renders front / 3-4 / side / face close-up for the given ids and an optional lineup.
usage: python tools/assets_people_render.py <glb> <outdir> [--lineup] [id ...]"""
import bpy, sys, os, math
from mathutils import Vector
args = [a for a in sys.argv[1:]]
glb, outdir = args[0], args[1]; lineup = '--lineup' in args; ids = [a for a in args[2:] if not a.startswith('--')]
os.makedirs(outdir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 28; sc.cycles.use_denoising = False
sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.42, 0.45, 0.5, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 3.2; sun.rotation_euler = (math.radians(55), 0, math.radians(35))
fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'AREA')); sc.collection.objects.link(fill); fill.data.energy = 120; fill.data.size = 4; fill.location = (-3, 3.5, 2.2); fill.rotation_euler = (math.radians(70), 0, math.radians(-40))
floor = bpy.data.objects.new('floor', bpy.data.meshes.new('floor')); sc.collection.objects.link(floor)
import bmesh
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12); bm.to_mesh(floor.data); bm.free()
fm = bpy.data.materials.new('fl'); fm.diffuse_color = (0.18, 0.19, 0.2, 1); floor.data.materials.append(fm)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
persons = {}
for o in bpy.data.objects:
    if o.name.startswith('person_') and o.type == 'ARMATURE': persons[o.name[7:]] = o
def children(o):
    out = [o]
    for c in o.children_recursive: out.append(c)
    return out
def show(pid):
    for k, o in persons.items():
        for c in children(o): c.hide_render = (k != pid); c.hide_viewport = (k != pid)
def look(cam, loc, tgt, lens):
    cam.location = loc; cam.data.lens = lens
    d = Vector(tgt) - Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
def shot(name, loc, tgt, lens, w_=600, h_=900):
    sc.render.resolution_x = w_; sc.render.resolution_y = h_
    look(cam, loc, tgt, lens); sc.render.filepath = os.path.join(outdir, name + '.png'); bpy.ops.render.render(write_still=True)
import json
meta = json.load(open(os.path.join(os.path.dirname(glb), 'people_meta.json')))
H = {p['id']: p for p in meta['people']}
for pid in ids:
    show(pid); h = H[pid]['heightM']; eye = H[pid]['eyeHeightM']
    d = 4.2
    shot(pid + '_front', (0, d, h * 0.52), (0, 0, h * 0.5), 50)
    shot(pid + '_34', (d * 0.7, d * 0.7, h * 0.52), (0, 0, h * 0.5), 50)
    shot(pid + '_side', (d, 0, h * 0.52), (0, 0, h * 0.5), 50)
    shot(pid + '_face', (0.25, 1.0, eye + 0.02), (0, 0, eye), 85, 700, 700)
if lineup:
    sel = ids or list(persons.keys())
    for k, o in persons.items():
        for c in children(o): c.hide_render = False; c.hide_viewport = False
    for i, k in enumerate(sorted(persons.keys())):
        o = persons[k]; o.location = ((i % 10 - 4.5) * 0.95, -(i // 10) * 1.3, 0)
    shot('lineup', (0, 11, 1.0), (0, -1.3, 0.85), 40, 1800, 700)
print('rendered')

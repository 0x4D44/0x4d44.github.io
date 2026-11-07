"""Render two illustrative eye-height scenes using actual decoded delivery pixels.

Run Blender 5.x headlessly with --threads 2 and --python-exit-code 1.
These are purpose-built asset-review scenes, not screenshots of the game.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DEV = ROOT / 'dev/groundsky'


def parse():
    p = argparse.ArgumentParser()
    p.add_argument('--decoded', type=Path, required=True)
    p.add_argument('--out', type=Path, default=DEV)
    p.add_argument('--samples', type=int, default=32)
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def reset(dusk=False):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.cycles.samples = ARGS.samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    world = bpy.data.worlds.new('Groundsky review sky')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (
        (.20, .16, .23, 1) if dusk else (.49, .66, .72, 1))
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6 if dusk else .8
    scene.world = world
    sun_data = bpy.data.lights.new('Soft Andean sun', 'SUN')
    sun_data.energy = .8 if dusk else 2.3
    sun_data.angle = .13
    sun_data.color = (1.0, .72, .48) if dusk else (1.0, .94, .83)
    sun = bpy.data.objects.new('Soft Andean sun', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(46), math.radians(-28), math.radians(-25))


def simple(name, color, rough=.85):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    return mat


def tex(record, nodes, x=0, y=0):
    path = ARGS.decoded / Path(record['path']).relative_to('dev/groundsky/masters')
    if not path.exists():
        raise RuntimeError(f'Review must use decoded delivered texture: {path}')
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'sRGB' if record['colourSpace'] == 'srgb' else 'Non-Color'
    node = nodes.new('ShaderNodeTexImage')
    node.image = image
    node.location = (x, y)
    node.interpolation = 'Linear'
    node.extension = 'REPEAT' if record['tiling']['x'] else 'CLIP'
    USED.add(record['path'])
    return node


def pbr(material_id):
    records = {r['role']: r for r in FILES if r['kind'] == 'ground' and
               r.get('materialId', r.get('material')) == material_id}
    if not records:
        raise ValueError(f'Unknown material {material_id}')
    mat = bpy.data.materials.new(material_id)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bs = nodes.get('Principled BSDF')
    colour = tex(records['albedo'], nodes, -700, 250)
    orm = tex(records['orm'], nodes, -700, -200)
    split = nodes.new('ShaderNodeSeparateColor')
    links.new(orm.outputs['Color'], split.inputs['Color'])
    ao = nodes.new('ShaderNodeMixRGB')
    ao.blend_type = 'MULTIPLY'
    ao.inputs[0].default_value = .35
    links.new(colour.outputs['Color'], ao.inputs[1])
    links.new(split.outputs['Red'], ao.inputs[2])
    links.new(ao.outputs[0], bs.inputs['Base Color'])
    links.new(split.outputs['Green'], bs.inputs['Roughness'])
    links.new(split.outputs['Blue'], bs.inputs['Metallic'])
    norm = tex(records['normal'], nodes, -700, -450)
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .65
    links.new(norm.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bs.inputs['Normal'])
    return mat


def cutout(record, emission=False):
    mat = bpy.data.materials.new(record['id'])
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    texture = tex(record, nodes, -650, 150)
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    if emission:
        shader = nodes.new('ShaderNodeEmission')
        links.new(texture.outputs['Color'], shader.inputs['Color'])
        shader.inputs['Strength'].default_value = 1
    else:
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Roughness'].default_value = .9
        links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    mix = nodes.new('ShaderNodeMixShader')
    links.new(texture.outputs['Alpha'], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(shader.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs[0])
    return mat


def mesh(name, vertices, faces, material, uvs=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    uv = data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        for loop in polygon.loop_indices:
            v = data.loops[loop].vertex_index
            uv.data[loop].uv = uvs[v] if uvs else (vertices[v][0], vertices[v][1])
    return ob


def plane(name, center, size, material, tile_m=1, rotation=0):
    x, y, z = center
    w, d = size
    verts = []
    for px, py in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]:
        verts.append((x + px*math.cos(rotation) - py*math.sin(rotation),
                      y + px*math.sin(rotation) + py*math.cos(rotation), z))
    u,v = (1,1) if tile_m is None else (w/tile_m,d/tile_m)
    uv = [(0,0),(u,0),(u,v),(0,v)]
    return mesh(name, verts, [(0,1,2,3)], material, uv)


def box(name, location, scale, material, bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(material)
    if bevel:
        mod = ob.modifiers.new('Small worn edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        ob.modifiers.new('Face normals', 'WEIGHTED_NORMAL')
    return ob


def rod(name, a, b, radius, material):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius,
                                      depth=(b-a).length, location=(a+b)*.5)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    ob.data.materials.append(material)
    return ob


def figure(x, y):
    mat = simple('1.80 m scale reference', (.44,.47,.42))
    parts=[]
    for side in [-1,1]:
        parts.append(box('Scale figure foot', (x+side*.10,y-.045,.05), (.15,.25,.10),mat,.025))
        parts.append(rod('Scale figure leg', (x+side*.10,y,.10), (x+side*.10,y,.90), .065, mat))
        parts.append(rod('Scale figure arm', (x+side*.20,y,1.40), (x+side*.30,y,1.02), .045, mat))
    parts.append(box('Scale figure torso', (x,y,1.18), (.34,.18,.58), mat, .07))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=.14,
                                      location=(x,y,1.66))
    bpy.context.object.name = 'Scale figure head — top exactly 1.80 m'
    bpy.context.object.data.materials.append(mat)
    parts.append(bpy.context.object)
    bpy.context.view_layer.update()
    heights=[(p.matrix_world@Vector(c)).z for p in parts for c in p.bound_box]
    assert abs(min(heights))<1e-6 and abs(max(heights)-1.8)<1e-6


def city(phase):
    for layer in ['far', 'middle', 'near']:
        record = next(r for r in FILES if r['kind']=='city' and
                      r['layer']==layer and r['timeOfDay']==phase)
        radius = record['radiusM']
        span = math.radians(record['arcDegrees'])
        height = record['worldSizeM'][1]
        top = radius * math.tan(math.radians(11))
        vertices, uv, faces = [], [], []
        for i in range(201):
            u = i / 200
            angle = (u-.5)*span
            x, y = radius*math.sin(angle), radius*math.cos(angle)
            vertices.extend([(x,y,top-height),(x,y,top)])
            uv.extend([(u,0),(u,1)])
            if i:
                n = 2*i
                faces.append((n-2,n,n+1,n-1))
        ob = mesh(f'City {layer}, {phase}, 200 degree arc', vertices, faces,
                  cutout(record, True), uv)
        if hasattr(ob, 'visible_shadow'):
            ob.visible_shadow = False


def billboard(family, x, y, width, height, cell=0):
    record = next(r for r in FILES if r['kind']=='vegetation' and
                  r['family']==family and r['lod']==0)
    col, row = cell%2, cell//2
    info=record['cells'][cell]
    authored_w,authored_h=info['worldSizeM']
    # Requested composition width is a uniform scale of the authored metre size.
    height=width*authored_h/authored_w
    bottom=-(1-info['pivot'][1])*height
    u0, u1 = col*.5, (col+1)*.5
    v0, v1 = 1-(row+1)*.5, 1-row*.5
    mesh(f'{family} atlas cell {cell}', [(x-width/2,y,bottom),(x+width/2,y,bottom),
         (x+width/2,y,bottom+height),(x-width/2,y,bottom+height)], [(0,1,2,3)],
         cutout(record), [(u0,v0),(u1,v0),(u1,v1),(u0,v1)])


def camera(location, target, lens=25):
    data = bpy.data.cameras.new('Eye height 1.60 m')
    ob = bpy.data.objects.new('Eye height 1.60 m', data)
    bpy.context.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = (Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    data.lens = lens
    data.clip_start = .05
    data.clip_end = 20000
    bpy.context.scene.camera = ob
    assert abs(location[2]-1.6) < 1e-7


def choose_material(fragment):
    ids = sorted({r.get('materialId', r.get('material')) for r in FILES if r['kind']=='ground'})
    return next(x for x in ids if fragment in x)


def material_scale(material_id):
    return next(r['worldSizeM'][0] for r in FILES if r['kind']=='ground'
                and r.get('materialId',r.get('material'))==material_id)


def ground_scene():
    reset()
    city('day')
    grass = choose_material('kikuyu_lush')
    plane('Authored metre scale lush kikuyu', (0,9,0), (40,46), pbr(grass), material_scale(grass))
    decals = [r for r in FILES if r['kind']=='decal']
    dirt = next(r for r in decals if r['id']=='dirt_patch_soft_albedo')
    for i in range(19):
        r = dirt
        # Respect each authored decal's metre size; overlaps form a worn path.
        w, h = r['worldSizeM'][:2]
        ob=plane(r['id'], (.5*math.sin(i*.32), -6+i*.95,.001+i*.00005),
              (w,h), cutout(r), None, rotation=.24*math.sin(i*.5))
        ob.visible_shadow=False
    gravel = next((r for r in decals if 'gravel' in r['id']), decals[3])
    w,h=gravel['worldSizeM'][:2]
    ob=plane('Gravel blending into verge', (1.7,1,.003), (w,h), cutout(gravel), None, rotation=.5)
    ob.visible_shadow=False
    concrete = choose_material('concrete')
    plane('Weathered concrete landing', (5,4,.015), (4,8), pbr(concrete), material_scale(concrete))
    stone = simple('Muted warm curb stone', (.31,.29,.25))
    for i in range(12):
        box('Small curb block', (3.02,-.2+i*.65,.07), (.18,.6,.14), stone)
    billboard('eucalyptus_stands', -20, 75, 18, 25)
    billboard('banana_groves', 17, 60, 12, 7, 1)
    billboard('cloud_forest_edge', -38, 105, 28, 14, 2)
    billboard('cypress_hedges', 30, 90, 22, 8, 3)
    figure(4.9,5)
    camera((0,-7,1.6),(0,9,.5),26)
    return 'eye-height-ground.png', dict(cameraPositionM=[0,-7,1.6],
        cameraHeightM=1.6, referenceHeightM=1.8, purpose='Soft ground patch edges and PBR at walking height')


def mirador_scene():
    reset(True)
    city('dusk')
    concrete = choose_material('concrete')
    plane('Mirador review platform', (0,0,0), (18,22), pbr(concrete), material_scale(concrete))
    brick = simple('Review-only warm brick', (.25,.105,.065))
    steel = simple('Review-only dark painted rail', (.055,.065,.062), .7)
    for x in [-7,-5,-3,-1,1,3,5,7]:
        rod('1.0 m rail post', (x,5,.08),(x,5,1.0), .028, steel)
    rod('Mirador top rail', (-7.5,5,1), (7.5,5,1), .035, steel)
    rod('Mirador middle rail', (-7.5,5,.55), (7.5,5,.55), .022, steel)
    for x in [-6.5,6.5]:
        box('Review planter', (x,3,.3), (1.25,1.25,.6), brick)
    wood = simple('Review bench wood', (.19,.115,.067))
    for y in [.3,.55,.8]:
        box('Review bench seat', (-5,y,.46), (2.3,.20,.08), wood)
    for x in [-5.8,-4.2]:
        box('Review bench leg', (x,.55,.23), (.12,.5,.46), steel)
    billboard('eucalyptus_stands', -28,70,18,25,2)
    billboard('rooftop_container_gardens', 11,10,4.5,3.0,0)
    figure(4.8,3)
    camera((0,-5,1.6),(0,500,-55),26)
    return 'eye-height-mirador.png', dict(cameraPositionM=[0,-5,1.6],
        cameraHeightM=1.6, referenceHeightM=1.8, purpose='Layered city and valley silhouettes beyond a mirador')


ARGS = parse()
if not bpy.app.background or bpy.app.version[0] != 5:
    raise SystemExit('Use Blender 5.x --background --threads 2')
ARGS.out.mkdir(parents=True, exist_ok=True)
CATALOGUE = json.loads((ROOT/'tools/groundsky.catalog.json').read_text())
FILES = [r for r in CATALOGUE['files'] if r['format']=='png']
USED = set()
results=[]
for build in [ground_scene, mirador_scene]:
    USED.clear()
    name, record = build()
    bpy.context.scene.render.filepath = str(ARGS.out/name)
    bpy.ops.render.render(write_still=True)
    source_records=[]
    for source in sorted(USED):
        delivery=next(r for r in CATALOGUE['files'] if r.get('derivedFrom')==source)
        source_records.append(dict(path=delivery['path'],sha256=hashlib.sha256((ROOT/delivery['path']).read_bytes()).hexdigest()))
    record.update(path=(ARGS.out/name).relative_to(ROOT).as_posix(),kind='eye-height',
                  renderer=f'Blender {bpy.app.version_string}; Cycles CPU; two threads; {ARGS.samples} samples',
                  scene='Illustrative asset review; not the La Ladera runtime',
                  pixelSource='Arm astcenc decoding of delivered ASTC level zero',
                  sceneSourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  sources=source_records)
    results.append(record)
(DEV/'render-metadata.json').write_text(json.dumps(dict(files=results),indent=2)+'\n')
print(json.dumps(dict(rendered=results),indent=2))

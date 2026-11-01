"""Render the EXPORTED beach-prop GLBs for visual acceptance, Blender 5.x.

No generator geometry is imported. Materials bind the dormant manifest's PBR
maps; imported glTF UVs are flipped back to the library's game UV convention.
Every item gets a detail view and a view beside an original 1.8 m mannequin.
Both perspective cameras remain exactly 1.6 m above the ground.

Run through tools/nice.mjs --idle with --background --factory-startup and
--python-exit-code 1. Compose sheets afterwards with beach_props_contact.py.
Raw renders are scratch evidence; only the contact sheets and index are shipped.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
EYE_HEIGHT = 1.6
FIGURE_HEIGHT = 1.8


def digest(path):
    path = Path(path)
    data = path.read_bytes()
    if path.suffix in ('.json', '.py'):
        data = data.replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()


def arguments():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--models', type=Path, default=ROOT / 'assets/models')
    ap.add_argument('--scratch', type=Path, required=True,
                    help='Raw render directory outside shipped assets; never silently cleared')
    ap.add_argument('--only', help='Comma-separated preview keys; cannot produce complete sheets')
    ap.add_argument('--samples', type=int, default=12)
    ap.add_argument('--width', type=int, default=512)
    ap.add_argument('--height', type=int, default=384)
    ap.add_argument('--resume', action='store_true', help='Reuse only renders pinned to the exact same inputs')
    return ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def material(name, color, roughness=.65):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def set_pbr(manifest, models):
    images = {}
    for key, meta in manifest['textures']['maps'].items():
        path = (models / meta['path']).resolve()
        if digest(path) != meta['sha256']:
            raise ValueError(f'Texture SHA mismatch: {path}')
        im = bpy.data.images.load(str(path), check_existing=True)
        im.colorspace_settings.name = 'sRGB' if key == 'albedo' else 'Non-Color'
        images[key] = im
    for mat in bpy.data.materials:
        # The importer may append .001 when several GLBs share a material name.
        name = mat.name.split('.')[0]
        if name not in manifest['materials']:
            continue
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        nodes.clear()
        output = nodes.new('ShaderNodeOutputMaterial')
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
        tex = {}
        for key, im in images.items():
            tex[key] = nodes.new('ShaderNodeTexImage')
            tex[key].image = im
            tex[key].interpolation = 'Linear'
            tex[key].extension = 'EXTEND'
        links.new(tex['albedo'].outputs['Color'], bsdf.inputs['Base Color'])
        normal = nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = .6
        links.new(tex['normal'].outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
        separate = nodes.new('ShaderNodeSeparateColor')
        separate.mode = 'RGB'
        links.new(tex['orm'].outputs['Color'], separate.inputs['Color'])
        links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
        links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
        if name.endswith('_alpha'):
            cut = nodes.new('ShaderNodeMath')
            cut.operation = 'GREATER_THAN'
            cut.inputs[1].default_value = .5
            links.new(tex['albedo'].outputs['Alpha'], cut.inputs[0])
            links.new(cut.outputs[0], bsdf.inputs['Alpha'])
        mat.use_backface_culling = False
    # GLB importer converts glTF UV origin to Blender origin. The library's
    # texture-free GLBs encode game-space atlas coordinates, so undo that flip
    # exactly once per shared mesh before binding the external game textures.
    for mesh in bpy.data.meshes:
        for layer in mesh.uv_layers:
            for loop in layer.data:
                loop.uv.y = 1 - loop.uv.y


def descendants(root):
    return [root, *root.children_recursive]


def show(objects, visible):
    for ob in objects:
        ob.hide_render = not visible


def sphere(name, at, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=at)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    ob.data.materials.append(mat)
    for face in ob.data.polygons:
        face.use_smooth = True
    if parent:
        ob.parent = parent
    return ob


def limb(name, a, b, radius, mat, parent):
    delta = Vector(b) - Vector(a)
    middle = (Vector(a) + Vector(b)) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=radius, depth=delta.length, location=middle)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    ob.data.materials.append(mat)
    for face in ob.data.polygons:
        face.use_smooth = True
    ob.parent = parent
    return ob


def mannequin():
    """Plain original reference figure with its exact top at 1.800 metres."""
    clay = material('review_figure_clay', (.31, .36, .38), .85)
    boots = material('review_figure_boots', (.18, .22, .23), .9)
    root = bpy.data.objects.new('review_figure_1_8m', None)
    bpy.context.scene.collection.objects.link(root)
    for side in (-1, 1):
        x = side * .095
        sphere('figure_shoe', (x, -.045, .055), (.073, .15, .055), boots, root)
        limb('figure_shin', (x, .0, .11), (x, .0, .49), .055, clay, root)
        sphere('figure_knee', (x, 0, .49), (.062, .062, .062), clay, root)
        limb('figure_thigh', (x, 0, .5), (side * .10, 0, .91), .078, clay, root)
        limb('figure_upper_arm', (side * .19, .0, 1.43), (side * .25, -.012, 1.16), .047, clay, root)
        limb('figure_forearm', (side * .25, -.012, 1.16), (side * .27, -.055, .94), .039, clay, root)
        sphere('figure_hand', (side * .27, -.06, .91), (.046, .035, .073), clay, root)
    sphere('figure_hips', (0, 0, .93), (.175, .115, .15), clay, root)
    sphere('figure_torso', (0, 0, 1.25), (.205, .115, .29), clay, root)
    limb('figure_neck', (0, 0, 1.48), (0, 0, 1.59), .052, clay, root)
    sphere('figure_head', (0, -.004, 1.687), (.087, .094, .113), clay, root)
    sphere('figure_nose', (0, -.088, 1.68), (.024, .032, .028), clay, root)
    return root


def setup_scene(width, height, samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.seed = 4613
    scene.cycles.use_animated_seed = False
    scene.cycles.max_bounces = 5
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.cycles.transparent_max_bounces = 8
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 35
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_persistent_data = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    world = bpy.data.worlds.new('review_daylight')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.78, .84, .87, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    scene.world = world
    for name, loc, energy, size in [('key', (-4, -5, 8), 1450, 6), ('fill', (5, 2, 5), 750, 5)]:
        data = bpy.data.lights.new('review_' + name, 'AREA')
        data.energy, data.shape, data.size = energy, 'DISK', size
        ob = bpy.data.objects.new('review_' + name, data)
        scene.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (Vector((0, 0, 1)) - ob.location).to_track_quat('-Z', 'Y').to_euler()
    ground = material('review_sand', (.53, .48, .37), .98)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
    bpy.context.object.name = 'review_ground'
    bpy.context.object.data.materials.append(ground)
    cam_data = bpy.data.cameras.new('review_camera')
    cam = bpy.data.objects.new('review_camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.type = 'PERSP'
    cam_data.sensor_width = 36
    cam_data.clip_start = .01
    cam_data.clip_end = 500
    return scene, cam, mannequin()


def bbox_corners(low, high):
    return [Vector((x, y, z)) for x in (low[0], high[0]) for y in (low[1], high[1]) for z in (low[2], high[2])]


def frame_camera(scene, camera, low, high, with_figure=False):
    target = (Vector(low) + Vector(high)) / 2
    extent = Vector(high) - Vector(low)
    distance = max(1.5, max(extent) * 1.45 + .25)
    # Camera always faces the +Z game front, from a modest three-quarter angle.
    camera.location = (target.x + distance * .46, target.y - distance * .888, EYE_HEIGHT)
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 50
    bpy.context.view_layer.update()
    for _ in range(3):
        projected = [world_to_camera_view(scene, camera, p) for p in bbox_corners(low, high)]
        extent_ndc = max(max(abs(p.x - .5), abs(p.y - .5)) * 2 for p in projected)
        camera.data.lens *= .82 / extent_ndc
        bpy.context.view_layer.update()
    return {'position': [camera.location.x, camera.location.z, -camera.location.y],
            'eyeHeight': EYE_HEIGHT, 'lensMm': camera.data.lens,
            'lookAt': [target.x, target.z, -target.y], 'projection': 'perspective',
            'referenceHeight': FIGURE_HEIGHT if with_figure else None}


def main():
    opt = arguments()
    if bpy.app.version[0] != 5:
        raise ValueError('Visual evidence requires Blender 5.x')
    if not 4 <= opt.samples <= 64 or opt.width < 256 or opt.height < 256:
        raise ValueError('Invalid render quality settings')
    opt.models = opt.models.resolve()
    opt.scratch = opt.scratch.resolve()
    opt.scratch.mkdir(parents=True, exist_ok=True)
    manifest_path = opt.models / 'manifest.beach_props.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    entries = {key: (f, a) for f in manifest['files'] for key, a in f['assets'].items() if not key.endswith('_lod1')}
    selected = set(opt.only.split(',')) if opt.only else set(entries)
    if selected - entries.keys():
        raise ValueError('Unknown render keys: ' + ', '.join(sorted(selected - entries.keys())))
    input_pins = {'manifest': digest(manifest_path),
                  'glbs': {f['glb']: f['sha256'] for f in manifest['files']},
                  'textures': {k: v['sha256'] for k, v in manifest['textures']['maps'].items()},
                  'renderScript': digest(__file__), 'samples': opt.samples,
                  'resolution': [opt.width, opt.height], 'blender': bpy.app.version_string,
                  'textHashNormalization': 'LF'}
    index_path = opt.scratch / 'renders.json'
    previous = json.loads(index_path.read_text()) if opt.resume and index_path.exists() else None
    if previous and previous.get('inputPins') != input_pins:
        raise ValueError('Resume refused: input files or renderer changed')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for f in manifest['files']:
        path = opt.models / f['glb']
        if digest(path) != f['sha256']:
            raise ValueError(f'GLB SHA mismatch: {path}')
        bpy.ops.import_scene.gltf(filepath=str(path))
    roots = {key: bpy.data.objects.get(key) for key in selected}
    if not all(roots.values()):
        raise ValueError('A manifest root is missing from the imported GLBs')
    imported = list(bpy.context.scene.objects)
    set_pbr(manifest, opt.models)
    show(imported, False)
    scene, camera, figure = setup_scene(opt.width, opt.height, opt.samples)
    figure_objects = descendants(figure)
    completed = previous['items'] if previous else {}
    for number, key in enumerate(entries):
        if key not in selected:
            continue
        f, meta = entries[key]
        near = descendants(roots[key])
        show(near, True)
        b = meta['bounds']
        low = [b['min'][0], -b['max'][2], b['min'][1]]
        high = [b['max'][0], -b['min'][2], b['max'][1]]
        views = {}
        for kind in ('detail', 'scale'):
            show(figure_objects, kind == 'scale')
            view_low, view_high = list(low), list(high)
            if kind == 'scale':
                figure.location = (high[0] + .48, 0, 0)
                view_low[1] = min(view_low[1], -.2)
                view_high[0] = figure.location.x + .33
                view_high[1] = max(view_high[1], .2)
                view_high[2] = max(view_high[2], FIGURE_HEIGHT)
            shot = frame_camera(scene, camera, view_low, view_high, kind == 'scale')
            path = opt.scratch / f'{key}-{kind}.png'
            old = completed.get(key, {}).get('views', {}).get(kind)
            if not (old and path.exists() and digest(path) == old.get('sha256')):
                scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True)
            shot.update({'file': path.name, 'sha256': digest(path)})
            views[kind] = shot
        show(near, False)
        far = f['assets'][key + '_lod1']
        completed[key] = {'key': key, 'description': meta['description'], 'size': meta['size'],
                          'bounds': meta['bounds'], 'nearTriangles': meta['triangles'],
                          'farTriangles': far['triangles'], 'family': meta['tags'][-1],
                          'sourceGlb': f['glb'], 'views': views}
        report = {'version': 1, 'complete': selected == set(entries) and len(completed) == len(entries),
                  'renderedItemCount': len(completed), 'expectedItemCount': len(entries),
                  'inputPins': input_pins, 'cameraEyeHeight': EYE_HEIGHT,
                  'referenceFigureHeight': FIGURE_HEIGHT,
                  'items': {name: completed[name] for name in entries if name in completed}}
        index_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf8', newline='\n')
        print(f'RENDER {number + 1}/{len(entries)} {key}: detail + 1.8m reference, eye=1.6m', flush=True)
    print(f'Rendered {len(completed)} items to {opt.scratch}; complete={report["complete"]}', flush=True)


if __name__ == '__main__':
    main()

"""Quiet Blender contact photography of the exported watersports GLBs.

node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
  --python-exit-code 1 --python la-ladera/tools/blender/watersports_preview.py \
  -- --out /tmp/watersports-renders

This imports the committed binary models and binds their external PBR atlas.
It never calls the geometry builders. Each asset gets a perspective view with
camera Y=1.6 m and an exactly 1.8 m measuring figure, plus a close catalogue
view. Floating items stand above a cutaway display floor so their submerged
geometry remains visible; a blue datum marker records waterline Y=0.
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

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def xyz(p):
    return (p[0], -p[2], p[1])


def game(p):
    return (p[0], p[2], -p[1])


def arguments():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--models', type=Path, default=ROOT/'assets/models')
    p.add_argument('--out', type=Path, default=Path('/tmp/watersports-renders'))
    p.add_argument('--only', help='comma-separated near keys; a partial visual preview')
    p.add_argument('--samples', type=int, default=8)
    p.add_argument('--width', type=int, default=512)
    p.add_argument('--height', type=int, default=384)
    p.add_argument('--threads', type=int, default=4)
    p.add_argument('--no-variants', action='store_true')
    p.add_argument('--transoms-only', action='store_true', help='four final transom close-ups for early visual review')
    p.add_argument('--skip-existing', action='store_true', help='resume only when input hashes and camera protocol still match')
    return p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])


def descendants(root):
    return [root, *root.children_recursive]


def bounds(objects):
    points=[]
    for ob in objects:
        if ob.type != 'MESH':
            continue
        points.extend(game(ob.matrix_world@Vector(p)) for p in ob.bound_box)
    lo=[min(p[i] for p in points) for i in range(3)]
    hi=[max(p[i] for p in points) for i in range(3)]
    return lo,hi


def plain_material(name, colour, roughness=.72):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*colour,1)
    bsdf.inputs['Roughness'].default_value=roughness
    return mat


def external_materials(manifest, models):
    images={}
    for key,entry in manifest['atlas']['maps'].items():
        image=bpy.data.images.load(str((models/entry['path']).resolve()),check_existing=True)
        image.colorspace_settings.name='sRGB' if key=='baseColor' else 'Non-Color'
        images[key]=image
    recipes=json.loads((HERE/'watersports.materials.json').read_text())['materials']
    for material in bpy.data.materials:
        name=material.name.split('.')[0]
        if name not in recipes:
            continue
        recipe=recipes[name]
        material.use_nodes=True
        nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
        output=nodes.new('ShaderNodeOutputMaterial')
        shader=nodes.new('ShaderNodeBsdfPrincipled')
        links.new(shader.outputs['BSDF'],output.inputs['Surface'])
        uv=nodes.new('ShaderNodeTexCoord')
        mapping=nodes.new('ShaderNodeMapping')
        # glTF import flips V. These external, game-bound atlases use bottom
        # origin UVs, so restore the GLB value before sampling the atlas.
        mapping.inputs['Scale'].default_value=(1,-1,1)
        mapping.inputs['Location'].default_value=(0,1,0)
        links.new(uv.outputs['UV'],mapping.inputs['Vector'])
        tex={}
        for key,image in images.items():
            node=nodes.new('ShaderNodeTexImage');node.image=image
            node.interpolation='Linear';node.extension='EXTEND'
            links.new(mapping.outputs['Vector'],node.inputs['Vector']);tex[key]=node
        links.new(tex['baseColor'].outputs['Color'],shader.inputs['Base Color'])
        split=nodes.new('ShaderNodeSeparateColor')
        links.new(tex['orm'].outputs['Color'],split.inputs['Color'])
        links.new(split.outputs['Green'],shader.inputs['Roughness'])
        if recipe.get('metalness',1):
            links.new(split.outputs['Blue'],shader.inputs['Metallic'])
        normal=nodes.new('ShaderNodeNormalMap')
        links.new(tex['normal'].outputs['Color'],normal.inputs['Color'])
        links.new(normal.outputs['Normal'],shader.inputs['Normal'])
        if recipe['alphaMode'] != 'OPAQUE':
            links.new(tex['baseColor'].outputs['Alpha'],shader.inputs['Alpha'])
            if hasattr(material,'surface_render_method'):
                material.surface_render_method='DITHERED'
        material.use_backface_culling=not recipe.get('doubleSided',False)


def cube(name, centre, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(centre))
    ob=bpy.context.object;ob.name=name
    ob.dimensions=(size[0],size[2],size[1]);ob.data.materials.append(mat)
    return ob


def rod(name,p,q,radius,mat,vertices=10):
    a,b=Vector(xyz(p)),Vector(xyz(q))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=(b-a).length,location=(a+b)/2)
    ob=bpy.context.object;ob.name=name
    ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();ob.data.materials.append(mat)
    return ob


def figure(mat):
    objects=[]
    for side in (-1,1):
        x=.095*side
        objects.append(cube('measure-foot',(x,.04,.035),(.105,.08,.23),mat))
        objects.append(rod('measure-shin',(x,.09,0),(x,.51,0),.047,mat))
        objects.append(rod('measure-thigh',(x,.51,0),(x,.96,0),.065,mat))
        objects.append(rod('measure-upper-arm',(.205*side,1.36,0),(.25*side,1.09,0),.046,mat))
        objects.append(rod('measure-forearm',(.25*side,1.09,0),(.28*side,.85,.018),.038,mat))
    objects.append(cube('measure-pelvis',(0,.955,0),(.27,.18,.17),mat))
    objects.append(cube('measure-chest',(0,1.20,0),(.34,.42,.17),mat))
    objects.append(rod('measure-neck',(0,1.41,0),(0,1.54,0),.059,mat))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=xyz((0,1.655,0)))
    head=bpy.context.object;head.name='measure-head'
    head.scale=(.105,.100,.145);head.data.materials.append(mat);objects.append(head)
    return objects


def make_scene(options):
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=options.samples
    scene.cycles.use_denoising=True
    scene.cycles.max_bounces=5;scene.cycles.transparent_max_bounces=8
    scene.render.threads_mode='FIXED';scene.render.threads=options.threads
    scene.render.resolution_x=options.width;scene.render.resolution_y=options.height
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
    scene.render.film_transparent=False
    scene.render.use_persistent_data=True
    scene.view_settings.view_transform='AgX'
    if scene.world is None:
        scene.world=bpy.data.worlds.new('watersports-studio')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.69,.74,.73,1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
    for name,position,power,size in [('key',(4,8,6),1000,7),('fill',(-5,5,1),650,7),('rim',(2,6,-6),850,5)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=xyz(position)
        ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('watersports-contact-camera');data.lens=38;data.sensor_width=36
    data.clip_start=.015;data.clip_end=250
    camera=bpy.data.objects.new('watersports-contact-camera',data);scene.collection.objects.link(camera);scene.camera=camera
    stage=plain_material('display sand',(.46,.50,.47))
    datum=plain_material('waterline datum',(.035,.25,.30))
    person=plain_material('1.8 metre figure',(.73,.65,.50))
    ground=cube('display floor',(0,-.025,0),(200,.03,200),stage)
    plinth=cube('figure datum plinth',(0,-.025,0),(.8,.03,.65),stage)
    water=[cube('waterline mark',(0,0,0),(1,.008,.015),datum),
           cube('waterline upright',(0,0,0),(.008,1,.015),datum)]
    people=figure(person)
    return scene,camera,ground,plinth,water,people


def pose_camera(scene,camera,lo,hi,eye,figure_x=None,transom=False):
    points=[(x,y,z) for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (lo[2],hi[2])]
    if figure_x is not None:
        points += [(figure_x+x,y,0+z) for x in (-.30,.30) for y in (0,1.8) for z in (-.12,.12)]
    lo2=[min(p[i] for p in points) for i in range(3)]
    hi2=[max(p[i] for p in points) for i in range(3)]
    target=((lo2[0]+hi2[0])/2,(lo2[1]+hi2[1])/2,(lo2[2]+hi2[2])/2)
    width=hi2[0]-lo2[0];height=hi2[1]-lo2[1];depth=hi2[2]-lo2[2]
    distance=max(.35,1.2*width,1.5*height,1.2*depth)
    azimuth=(0,-1) if transom else (.68,.82)
    for _ in range(45):
        cy=1.6 if eye else target[1]+distance*.62
        position=(target[0]+azimuth[0]*distance,cy,target[2]+azimuth[1]*distance)
        camera.location=xyz(position)
        camera.rotation_euler=(Vector(xyz(target))-camera.location).to_track_quat('-Z','Y').to_euler()
        bpy.context.view_layer.update()
        projected=[world_to_camera_view(scene,camera,Vector(xyz(p))) for p in points]
        if all(.045<p.x<.955 and .065<p.y<.935 and p.z>0 for p in projected):
            break
        distance*=1.12
    return {'position':list(position),'target':list(target),'lensMm':camera.data.lens,
            'eyeHeightMetres':1.6 if eye else None,'figureHeightMetres':1.8 if figure_x is not None else None}


def change_variant(objects,source,target):
    """Operate on imported GLB UVs; undo after each shot, including shared meshes."""
    saved=[];seen=set()
    du=target[0]-source[0];dv=target[1]-source[1]
    for ob in objects:
        if ob.type!='MESH' or ob.data.as_pointer() in seen or ob.data.uv_layers.active is None:
            continue
        seen.add(ob.data.as_pointer());layer=ob.data.uv_layers.active
        original=[tuple(item.uv) for item in layer.data];changed=False
        for item in layer.data:
            u,blender_v=item.uv;v=1-blender_v
            if source[0]-1e-6<=u<=source[2]+1e-6 and source[1]-1e-6<=v<=source[3]+1e-6:
                item.uv=(u+du,blender_v-dv);changed=True
        if changed:saved.append((layer,original))
    return saved


def restore_variant(saved):
    for layer,original in saved:
        for item,uv in zip(layer.data,original):item.uv=uv


def main():
    options=arguments();options.models=options.models.resolve();options.out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((options.models/'manifest.watersports.json').read_text())
    catalogue=json.loads((HERE/'watersports.catalog.json').read_text())['assets']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    roots={};source={}
    for file in manifest['files']:
        bpy.ops.import_scene.gltf(filepath=str(options.models/file['glb']))
        for key,record in file['assets'].items():
            root=bpy.data.objects.get(record.get('node',key))
            if root is None:raise RuntimeError('Imported GLB root missing: '+key)
            roots[key]=root;source[key]={'file':file['glb'],'sha256':file['sha256']}
    external_materials(manifest,options.models)
    scene,camera,ground,plinth,water,people=make_scene(options)
    original_people={ob:ob.location.copy() for ob in people}
    for root in roots.values():
        for ob in descendants(root):ob.hide_render=True
    chosen=set(options.only.split(',')) if options.only else set(catalogue)
    unknown=chosen-set(catalogue)
    if unknown:raise ValueError('Unknown preview asset: '+','.join(sorted(unknown)))
    if options.transoms_only:
        chosen={key for key in chosen if key.startswith('watersports_wooden_boat_')}
    records=[]
    old={}
    indexpath=options.out/'contact-index.json'
    if options.skip_existing and indexpath.exists():
        old={r['image']:r for r in json.loads(indexpath.read_text()).get('shots',[])}

    def render(key,kind,tile=None,variant_family=None,transom=False):
        root=roots[key];objects=descendants(root)
        for ob in objects:ob.hide_render=False
        bpy.context.view_layer.update();lo,hi=bounds(objects)
        floating=catalogue[key].get('floating',False)
        floor=min(-.015,lo[1]-.025)
        ground.location=xyz((0,floor-.015,0))
        eye=kind=='eye'
        figure_x=hi[0]+.85 if eye else None
        for ob in people:
            ob.hide_render=not eye
            ob.location=original_people[ob]+Vector(xyz((figure_x or 0,0,0)))
        plinth.hide_render=not eye or floor>-.05
        plinth.location=xyz((figure_x or 0,floor/2,0));plinth.dimensions=(.8,.65,-floor)
        for ob in water:ob.hide_render=not floating
        if floating:
            water[0].location=xyz(((lo[0]+hi[0])/2,0,lo[2]-.15))
            water[0].dimensions=(max(.6,hi[0]-lo[0]+.3),.015,.008)
            water[1].location=xyz((lo[0]-.15,floor/2,lo[2]-.15))
            water[1].dimensions=(.008,.015,-floor)
        if transom:
            detail_hi=list(hi);detail_hi[2]=lo[2]+.45
            cam=pose_camera(scene,camera,lo,detail_hi,True,None,transom=True)
        else:
            cam=pose_camera(scene,camera,lo,hi,eye,figure_x)
        suffix=(f'-{tile}' if tile else '')
        filename=f'{key}-{kind}{suffix}.png'
        saved=[]
        if tile:
            variant=catalogue[key]['variants'][variant_family]
            saved=change_variant(objects,manifest['atlas']['tiles'][variant['sourceTile']],manifest['atlas']['tiles'][tile])
            if not saved:raise RuntimeError(f'{key}: variant {tile} changed no imported GLB UVs')
        entry={'key':key,'kind':kind,'image':filename,'variant':tile,'variantFamily':variant_family,
               'source':source[key],'atlasSha256':{k:v['sha256'] for k,v in manifest['atlas']['maps'].items()},
               'bounds':{'min':lo,'max':hi},'camera':cam,'floating':floating,
               'figureHeightMetres':1.8 if eye else None,'waterlineY':0 if floating else None,
               'samples':options.samples,'threads':options.threads,'size':[options.width,options.height],
               'persistentRenderData':True,'denoising':True}
        reusable=options.skip_existing and old.get(filename)==entry and (options.out/filename).exists()
        try:
            if not reusable:
                scene.render.filepath=str(options.out/filename)
                bpy.ops.render.render(write_still=True)
            records.append(entry)
            indexpath.write_text(json.dumps({'version':1,'method':'imported GLB; external PBR atlas; Cycles CPU',
                                            'complete':chosen==set(catalogue) and not options.no_variants,'shots':records},indent=2)+'\n')
            print('CONTACT '+filename+' '+json.dumps(cam),flush=True)
        finally:
            restore_variant(saved)
            for ob in objects:ob.hide_render=True

    # First inspect the decals from their real outward-facing side, then the
    # large hulls. Remaining sheets are sorted back into catalogue order by the
    # compositor. These are final captures, not a separate temporary scene.
    wooden=[key for key in catalogue if key.startswith('watersports_wooden_boat_') and key in chosen]
    for key in wooden:
        render(key,'transom',transom=True)
    if options.transoms_only:
        print(f'RENDERED {len(records)} transom views; '+str(indexpath),flush=True)
        return
    priority=[key for key in catalogue if 'lancha' in key or 'kayak' in key]
    order=priority+[key for key in catalogue if key not in priority]
    for key in order:
        if key not in chosen:continue
        render(key,'eye');render(key,'catalogue')
    if not options.no_variants:
        variant_seen=set()
        for key,cat in catalogue.items():
            if key not in chosen:continue
            for family,variant in cat.get('variants',{}).items():
                if family in variant_seen:continue
                variant_seen.add(family)
                for tile in variant['tiles']:
                    is_name=family in ('names','name','boatNames') or 'wooden' in key
                    render(key,'transom' if is_name else 'variant',tile,family,transom=is_name)
    print(f'RENDERED {len(records)} images from {len(chosen)} exported near roots; '+str(indexpath),flush=True)


if __name__=='__main__':main()

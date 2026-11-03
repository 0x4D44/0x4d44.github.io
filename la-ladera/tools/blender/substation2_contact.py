"""Quiet CPU renders of actual exported GLBs, every item at1.6m with1.8m figure.

The independent yard assembly reads plan data and the tested catenary tool.
Nothing here runs in the game. Use Blender5 --background through tools/nice.mjs.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
sys.path.insert(0,str(HERE))
import furn_lib as F

def descendants(root):
    yield root
    for child in root.children: yield from descendants(child)

def visible(root,value):
    for obj in descendants(root): obj.hide_render=not value

def flat(name,colour,rough=.7):
    mat=bpy.data.materials.new(name); mat.diffuse_color=(*colour,1); mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*colour,1); bsdf.inputs['Roughness'].default_value=rough
    return mat

def bind_materials(models):
    data=json.loads((models/'substation2/materials.json').read_text()); library=models/'substation2'
    images={k:bpy.data.images.load(str((library/data['atlas'][k]).resolve()),check_existing=True) for k in ('map','normal','orm')}
    images['normal'].colorspace_settings.name='Non-Color'; images['orm'].colorspace_settings.name='Non-Color'
    for name in data['materials']:
        if bpy.data.materials.get(name) is None: bpy.data.materials.new(name)
        for mat in [m for m in bpy.data.materials if m.name==name or m.name.startswith(name+'.')]:
            mat.use_nodes=True; nodes=mat.node_tree.nodes; nodes.clear(); links=mat.node_tree.links
            output=nodes.new('ShaderNodeOutputMaterial'); bsdf=nodes.new('ShaderNodeBsdfPrincipled')
            links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
            uv=nodes.new('ShaderNodeTexCoord'); flip=nodes.new('ShaderNodeVectorMath'); flip.operation='MULTIPLY_ADD'
            flip.inputs[1].default_value=(1,-1,1); flip.inputs[2].default_value=(0,1,0); links.new(uv.outputs['UV'],flip.inputs[0])
            textures={}
            for channel in images:
                textures[channel]=nodes.new('ShaderNodeTexImage'); textures[channel].image=images[channel]
                textures[channel].extension='EXTEND'; links.new(flip.outputs['Vector'],textures[channel].inputs['Vector'])
            attr=nodes.new('ShaderNodeVertexColor'); attr.layer_name='Col'
            multiply=nodes.new('ShaderNodeMixRGB'); multiply.blend_type='MULTIPLY'; multiply.inputs[0].default_value=1
            links.new(textures['map'].outputs['Color'],multiply.inputs[1]); links.new(attr.outputs['Color'],multiply.inputs[2])
            links.new(multiply.outputs[0],bsdf.inputs['Base Color'])
            separate=nodes.new('ShaderNodeSeparateColor'); links.new(textures['orm'].outputs['Color'],separate.inputs['Color'])
            links.new(separate.outputs['Green'],bsdf.inputs['Roughness']); links.new(separate.outputs['Blue'],bsdf.inputs['Metallic'])
            normal=nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value=.35
            links.new(textures['normal'].outputs['Color'],normal.inputs['Color']); links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    for mesh in bpy.data.meshes:
        if mesh.color_attributes and mesh.color_attributes.active_color: mesh.color_attributes.active_color.name='Col'

def figure():
    a=F.Asset('reference_figure',{'size':[.65,1.8,.35]}); body='reference_body'; skin='reference_skin'; dark='reference_boot'
    a.box(body,0,.86,0,.43,.51,.24,col=0xffffff,r=.045)
    a.cyl(skin,0,1.38,0,.066,.09,n=8,col=0xffffff); a.sph(skin,0,1.635,0,.105,.165,.105,n=12,col=0xffffff)
    for sign in (-1,1):
        a.tube(body,[(sign*.12,.89,0),(sign*.12,.48,.015),(sign*.13,.10,0)],.073,n=8,col=0xffffff)
        a.box(dark,sign*.13,0,.055,.15,.13,.29,col=0xffffff,r=.025)
        a.tube(body,[(sign*.24,1.30,0),(sign*.30,1.07,.035),(sign*.29,.86,.06)],.053,n=8,col=0xffffff)
        a.sph(skin,sign*.29,.83,.065,.048,.075,.04,n=8,col=0xffffff)
    root=F.build_objects(a,bpy.context.scene.collection)
    palette={body:(.17,.30,.36),skin:(.55,.34,.22),dark:(.055,.065,.06)}
    for obj in root.children:
        name=obj.data.materials[0].name; obj.data.materials.clear(); obj.data.materials.append(flat(name+'_render',palette[name]))
    return root

def look(camera,target): camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()

def clone(root,collection,name):
    mapping={}
    for original in descendants(root):
        obj=original.copy()
        if original.data: obj.data=original.data
        collection.objects.link(obj); obj.name=name+'__'+original.name; obj.hide_render=False; mapping[original]=obj
    for original,obj in mapping.items():
        if original.parent in mapping: obj.parent=mapping[original.parent]
    return mapping[root]

def setup(samples):
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.device='CPU'
    scene.cycles.samples=samples; scene.cycles.use_denoising=True
    scene.cycles.max_bounces=4; scene.cycles.diffuse_bounces=2; scene.cycles.glossy_bounces=2
    scene.render.threads_mode='FIXED'; scene.render.threads=2
    scene.render.resolution_x=560; scene.render.resolution_y=440; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.world=bpy.data.worlds.new('substation_studio'); scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value=(.60,.69,.76,1); bg.inputs['Strength'].default_value=.6
    scene.view_settings.view_transform='AgX'
    light=bpy.data.lights.new('late_afternoon','SUN'); light.energy=2.2; light.angle=.18
    obj=bpy.data.objects.new('late_afternoon',light); scene.collection.objects.link(obj)
    obj.rotation_euler=(math.radians(25),math.radians(-24),math.radians(-38))
    camera=bpy.data.objects.new('1.6m_eye',bpy.data.cameras.new('1.6m_eye')); scene.collection.objects.link(camera); scene.camera=camera
    camera.data.lens=42; camera.data.clip_start=.03; camera.data.clip_end=400
    bpy.ops.mesh.primitive_plane_add(size=500); floor=bpy.context.object; floor.name='neutral_floor'; floor.location.z=0
    floor.data.materials.append(flat('neutral_ground',(.26,.29,.28),.95)); scene.render.film_transparent=False
    return scene,camera,floor

def framed_eye(scene,camera,item,ref):
    w,h,d=item['size']; ref.location=F.to_blender((w/2+.55,0,.10)); highest=max(h,1.8)
    horizontal=max(2.5,(w+.9)*1.05,highest*1.15,d*1.7)
    corners=[F.to_blender((x,y,z)) for x in (-w/2,w/2+.9) for y in (0,highest) for z in (-d/2,d/2)]
    for _ in range(100):
        camera.location=(horizontal*.58,-horizontal*.815,1.6); look(camera,(.25,0,highest*.44)); bpy.context.view_layer.update()
        points=[world_to_camera_view(scene,camera,Vector(p)) for p in corners]
        if all(p.z>0 and .055<=p.x<=.945 and .08<=p.y<=.92 for p in points): return
        horizontal*=1.07
    raise RuntimeError('Could not frame '+item['id'])

def catalogue_shots(args,scene,camera,roots,ref):
    catalogue=json.loads((ROOT/'tools/blender/substation2.catalog.json').read_text())
    wanted={key.removeprefix('substation_') for key in args.only.split(',')} if args.only else None; report=[]
    known={item['id'].removeprefix('substation_') for item in catalogue['assets']}
    if wanted and wanted-known: raise ValueError('Unknown catalogue IDs: '+', '.join(sorted(wanted-known)))
    for item in catalogue['assets']:
        if wanted and item['id'].removeprefix('substation_') not in wanted: continue
        for lod in ([False,True] if args.lod else [False]):
            key=item['id']+('_lod1' if lod else ''); root=roots[key]; visible(root,True); visible(ref,True)
            framed_eye(scene,camera,item,ref); path=args.out/(key+'.png'); scene.render.filepath=str(path)
            bpy.ops.render.render(write_still=True)
            report.append({'id':key,'file':path.name,'size':item['size'],
                'cameraGame':[camera.location.x,camera.location.z,-camera.location.y],
                'cameraHeightMetres':camera.location.z,'figureHeightMetres':1.8,
                'triangles':sum(len(o.data.polygons) for o in descendants(root) if o.type=='MESH')})
            visible(root,False); print('RENDERED '+key,flush=True)
    visible(ref,False); (args.out/'contact-report.json').write_text(json.dumps(report,indent=2)+'\n')

def yard_shot(args,scene,camera,roots,ref,floor):
    plan=json.loads((args.models/'substation2/substation2-plan.json').read_text())
    materials=json.loads((args.models/'substation2/materials.json').read_text())
    yard=bpy.data.collections.new('yard_from_plan'); scene.collection.children.link(yard)
    records=list(plan.get('equipment',[]))
    for field in ('instances','site','towers','groundTiles','fencePanels'):
        value=plan.get(field,[])
        if isinstance(value,list): records += [r for r in value if isinstance(r,dict) and 'asset' in r]
    seen=set(); count=0
    for i,rec in enumerate(records):
        rid=rec.get('id',f'item_{i}')
        if rid in seen: continue
        seen.add(rid); key=rec['asset']
        if key not in roots: raise ValueError(f'Unknown plan asset {key}')
        instance=clone(roots[key],yard,rid); instance.location=F.to_blender(rec['position'])
        # The glTF importer sets QUATERNION mode, so switch mode before applying
        # the plan's +Y yaw (Blender +Z). An Euler write alone would be ignored.
        instance.rotation_mode='XYZ'; instance.rotation_euler=(0,0,rec.get('rotationY',0))
        for child in descendants(instance):
            if child.type!='MESH': continue
            for index,slot in enumerate(list(child.material_slots)):
                key=slot.material.name if slot.material else None; replacement=rec.get('materialOverrides',{}).get(key)
                if replacement:
                    source=materials['atlas']['tiles'][key]; target=materials['atlas']['tiles'][replacement]; child.data=child.data.copy()
                    for loop in child.data.uv_layers.active.data:
                        u,v=loop.uv; v=1-v; u=(u-source[0])/(source[2]-source[0]); v=(v-source[1])/(source[3]-source[1])
                        loop.uv=(target[0]+u*(target[2]-target[0]),1-(target[1]+v*(target[3]-target[1])))
                    slot=child.material_slots[index]; slot.link='OBJECT'; slot.material=bpy.data.materials[replacement]
        if 'scale' in rec:
            sx,sy,sz=rec['scale']; instance.scale=(sx,sz,sy)
        count+=1
    span_count=0
    if plan.get('spans'):
        output=args.out/'yard-span-instances.json'
        result=subprocess.run([args.node,str(ROOT/'tools/substation2_catenary.mjs'),str(args.models/'substation2/substation2-plan.json'),str(output)],
                              check=True,stdin=subprocess.DEVNULL,timeout=60,
                              creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        data=json.loads(output.read_text())
        for group in data['spans']:
            for j,seg in enumerate(group['instances']):
                root=clone(roots['substation_conductor_segment'],yard,f"span_{group['id']}_{j}")
                root.location=F.to_blender(seg['position']); x,y,z,w=seg['quaternion']; root.rotation_mode='QUATERNION'
                root.rotation_quaternion=(w,x,-z,y); sx,sy,sz=seg['scale']; root.scale=(sx,sz,sy); span_count+=1
    ground=plan['compound'].get('groundLevel',0); floor.location.z=ground-.005
    visible(ref,True); ref.location=F.to_blender((1,ground,14))
    scene.render.resolution_x=1800; scene.render.resolution_y=1300; scene.cycles.samples=max(24,args.samples)
    camera.data.lens=42; camera.location=(72,-85,69); look(camera,(0,0,5.5))
    scene.render.filepath=str(args.out/'yard-overview.png'); bpy.ops.render.render(write_still=True)
    camera.data.lens=32; camera.location=(-12,-16,ground+1.6); look(camera,(-5,6,3.3))
    scene.render.filepath=str(args.out/'yard-eye-1_6m.png'); bpy.ops.render.render(write_still=True)
    (args.out/'yard-render-report.json').write_text(json.dumps({'plan':'substation2-plan.json','placedRecords':count,
        'conductorSegments':span_count,'eyeHeightAboveGround':1.6,'source':'actual exported GLB mesh instances',
        'certification':'Plausible visual layout, not engineering-certified'},indent=2)+'\n')

def main():
    if not bpy.app.background: raise RuntimeError('Headless only: use --background')
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--models',type=Path,default=ROOT/'assets/models'); p.add_argument('--out',type=Path,required=True)
    p.add_argument('--only'); p.add_argument('--lod',action='store_true'); p.add_argument('--yard-only',action='store_true')
    p.add_argument('--skip-yard',action='store_true'); p.add_argument('--samples',type=int,default=12); p.add_argument('--node',default='node')
    args=p.parse_args(F.argv_after_dashes()); args.out=args.out.resolve(); args.out.mkdir(parents=True,exist_ok=True)
    F.reset(); manifest=json.loads((args.models/'manifest.substation2.json').read_text())
    sources=[args.models/'manifest.substation2.json',args.models/'substation2/substation2-plan.json',args.models/'substation2/materials.json',
             ROOT/'tools/blender/substation2.catalog.json']
    sources += [args.models/f['glb'] for f in manifest['files']]
    sources += list((args.models.parent/'textures/substation2').glob('*.png'))
    def source_key(path):
        return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)
    pins={source_key(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}
    for file in manifest['files']: bpy.ops.import_scene.gltf(filepath=str(args.models/file['glb']))
    roots={obj.name:obj for obj in bpy.context.scene.objects if obj.parent is None}
    bind_materials(args.models)
    for root in roots.values(): visible(root,False)
    scene,camera,floor=setup(args.samples); ref=figure()
    if not args.yard_only: catalogue_shots(args,scene,camera,roots,ref)
    if not args.skip_yard: yard_shot(args,scene,camera,roots,ref,floor)
    after={source_key(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}
    if pins!=after: raise RuntimeError('Source assets changed during rendering; evidence is stale')
    (args.out/'source-pins.json').write_text(json.dumps(pins,indent=2)+'\n')

if __name__=='__main__': main()

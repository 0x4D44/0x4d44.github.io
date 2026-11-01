"""Build the standalone watersports library in Blender 5.x, quietly.

node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
  --python-exit-code 1 --python la-ladera/tools/blender/watersports_build.py

Exports are staged, independently decoded, and validated before publication.
The manifest is installed last. This builder never edits a runtime registry.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE=Path(__file__).resolve().parent
if str(HERE) not in sys.path:sys.path.insert(0,str(HERE))
import bpy
import furn_lib as L
import watersports_common as W
from watersports_atlas import write_atlas

ROOT=HERE.parent.parent
CATALOG=HERE/'watersports.catalog.json'
MATERIALS=HERE/'watersports.materials.json'


def lfhash(path):
    return hashlib.sha256(Path(path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()


def arguments():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=ROOT/'assets/models')
    parser.add_argument('--only',help='comma-separated base keys; requires a separate --out')
    parser.add_argument('--node',default='node')
    parser.add_argument('--counts',action='store_true')
    parser.add_argument('--write-catalogue',action='store_true',help='Refresh the reviewable nominal contract from authored metadata')
    return parser.parse_args(L.argv_after_dashes() if '--' in sys.argv else [])


def modules():
    import watersports_boards
    import watersports_boats
    import watersports_pier
    return {'boards':watersports_boards,'boats':watersports_boats,'pier':watersports_pier}


def inspect(path,node):
    script=('import {inspectWatersportsGlb} from '+json.dumps((HERE/'watersports_validate.mjs').as_uri())+';'
            'const r=inspectWatersportsGlb(process.argv[1]); console.log(JSON.stringify([...r.assets.values()],'
            '(_k,v)=>v instanceof Set?[...v]:v));')
    return json.loads(subprocess.check_output([node,'--input-type=module','-e',script,str(path)],text=True))


def material_settings():
    for name in (W.MAT,W.ALPHA,W.GLASS,W.FABRIC):
        material=L.get_mat(name)
        material.use_nodes=True
        shader=material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=(1,1,1,1)
        shader.inputs['Roughness'].default_value=.7
        if name==W.GLASS:
            shader.inputs['Alpha'].default_value=.24
            if hasattr(material,'surface_render_method'):material.surface_render_method='BLENDED'
            elif hasattr(material,'blend_method'):material.blend_method='BLEND'
            material.diffuse_color=(.75,.9,.9,.24)
        elif name==W.ALPHA:
            if hasattr(material,'surface_render_method'):material.surface_render_method='DITHERED'
            elif hasattr(material,'blend_method'):material.blend_method='CLIP'
        material.use_backface_culling=name==W.MAT


def install(staged,out):
    targets=[(staged/'models/watersports',out/'watersports'),
             (staged/'textures/watersports',out.parent/'textures/watersports'),
             (staged/'models/manifest.watersports.json',out/'manifest.watersports.json')]
    previous=[];written=[]
    try:
        for i,(source,target) in enumerate(targets):
            target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists():
                backup=staged/f'previous-{i}';target.rename(backup);previous.append((backup,target))
            source.rename(target);written.append(target)
    except BaseException:
        for target in reversed(written):
            if target.is_dir():shutil.rmtree(target)
            elif target.exists():target.unlink()
        for backup,target in reversed(previous):backup.rename(target)
        raise


def main():
    opt=arguments();mods=modules();authored={}
    for module in mods.values():
        for key,cat in module.CATALOG.items():
            if key in authored:raise ValueError('duplicate catalogue key: '+key)
            authored[key]=cat
    if opt.write_catalogue:
        catalogue={'version':1,'units':'metres','axes':'+Y up, +Z front',
                   'originPolicy':'Base support centre: floor Y=0 or floating waterline Y=0. Rig overhangs may be asymmetric.',
                   'assets':authored}
        CATALOG.write_text(json.dumps(catalogue,indent=2)+'\n',encoding='utf8',newline='\n')
        print(f'Wrote nominal catalogue for {len(authored)} designs',flush=True)
    catalog=json.loads(CATALOG.read_text(encoding='utf8'))['assets']
    if set(authored)!=set(catalog):raise ValueError('authored/catalogue key mismatch')
    only=set(opt.only.split(',')) if opt.only else set(catalog)
    if only-set(catalog):raise ValueError('unknown keys: '+str(only-set(catalog)))
    out=opt.out.resolve();partial=only!=set(catalog)
    if opt.only and out==(ROOT/'assets/models').resolve() and not opt.counts:
        raise ValueError('Filtered preview requires --out outside shipped models')
    for module in mods.values():
        if set(module.CATALOG)!=set(module.BUILDERS):raise ValueError('builder keys mismatch')
    if opt.counts:
        for module in mods.values():
            for key,fn in module.BUILDERS.items():
                if key not in only:continue
                counts=[]
                for lod in (0,1):
                    model=W.Model(key,catalog[key],lod);fn(model);counts.append(model.triangles())
                print(f'{key:40s} near={counts[0]:4d} far={counts[1]:4d} ratio={counts[1]/max(1,counts[0]):.3f}',flush=True)
        return
    out.mkdir(parents=True,exist_ok=True)
    # Keep provisional files outside the shipped tree, but on the target volume
    # (a Windows checkout may be on H: while the system temp directory is C:).
    # In particular, payload.mjs must not count staging atlases as game assets.
    stage_parent=ROOT/'dev/watersports/.staging' if out==(ROOT/'assets/models').resolve() else out.parent
    stage_parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='watersports-build-',dir=stage_parent) as tmp:
        staged=Path(tmp);models=staged/'models';(models/'watersports').mkdir(parents=True)
        atlas=write_atlas(staged/'textures/watersports')
        files=[]
        for family,module in mods.items():
            keys=[key for key in module.CATALOG if key in only]
            if not keys:continue
            L.reset();cache={}
            for key in keys:
                for lod in (0,1):
                    model=W.Model(key,catalog[key],lod);module.BUILDERS[key](model)
                    W.create_objects(model,cache)
            material_settings()
            path=models/f'watersports/watersports_{family}.glb'
            L.export_glb(str(path))
            assets={}
            for actual in inspect(path,opt.node):
                name=actual['key'];lod=name.endswith('_lod1');key=name[:-5] if lod else name;cat=catalog[key]
                meta={'node':name,'size':cat['size'],'origin':cat['origin'],
                      'triangles':actual['triangles'],'parts':actual['parts'],
                      'bounds':{'min':actual['min'],'max':actual['max']},
                      'pivots':[p['name'] for p in actual['pivots']],
                      'description':cat.get('description',key),'tags':['watersports',family]}
                if lod:meta['lod']=1
                else:meta['lod1']=key+'_lod1'
                assets[name]=meta
                print(f'{name:45s} {actual["triangles"]:4d} tris {actual["parts"]:2d} parts',flush=True)
            data=path.read_bytes()
            files.append({'glb':f'watersports/{path.name}','bytes':len(data),
                          'sha256':hashlib.sha256(data).hexdigest(),'assets':assets})
        anchors={'version':1,'units':'metres','axes':'+Y up, +Z front',
                 'motionUnits':{'bobAmplitude':'metres','rockAmplitudeDeg':'degrees'},
                 'seaDatum':-1.2,
                 'assets':{key:{**catalog[key].get('anchors',{}),
                                'floating':catalog[key]['floating'],
                                'draftDepth':catalog[key]['draftDepth'],
                                'bobAmplitude':catalog[key]['bobAmplitude'],
                                'rockAmplitudeDeg':catalog[key]['rockAmplitudeDeg']}
                           for key in catalog if key in only}}
        anchorpath=models/'watersports/anchors.json'
        anchorpath.write_text(json.dumps(anchors,indent=2)+'\n',encoding='utf8',newline='\n')
        glbbytes=sum(f['bytes'] for f in files);texturebytes=sum(f['bytes'] for f in atlas['maps'].values())
        manifest={'version':1,'complete':not partial,'license':'CC0-1.0','units':'metres',
                  'generator':{'script':'tools/blender/watersports_build.py','blender':bpy.app.version_string,
                               'catalogSha256':lfhash(CATALOG),'anchorsSha256':lfhash(anchorpath),
                               'materialsSha256':lfhash(MATERIALS),'textHashForm':'UTF-8 with CRLF normalized to LF'},
                  'assetCount':len(only),'lodCount':len(only),'glbBytes':glbbytes,'textureBytes':texturebytes,
                  'totalBytes':glbbytes+texturebytes,'atlas':atlas,'files':files}
        (models/'manifest.watersports.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8',newline='\n')
        command=[opt.node,str(HERE/'watersports_validate.mjs'),'--models',str(models),
                 '--anchors',str(anchorpath),'--catalogue',str(CATALOG),'--materials',str(MATERIALS)]
        if not partial:command.append('--complete')
        validation=subprocess.run(command,capture_output=True,text=True)
        print(validation.stdout,flush=True)
        if validation.stderr:print(validation.stderr,file=sys.stderr,flush=True)
        validation.check_returncode()
        install(staged,out)
        print(f'Installed {len(only)} designs + LODs: {glbbytes:,} GLB bytes, {texturebytes:,} texture bytes',flush=True)


if __name__=='__main__':main()

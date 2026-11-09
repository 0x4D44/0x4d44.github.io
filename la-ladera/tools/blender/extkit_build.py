"""Catalogue-driven, headless exterior-kit build using existing furniture helpers.

Texture authoring is a separate deterministic command. This builder stages the
two packed GLBs, the existing PBR outputs and manifest, validates the complete
staged payload independently, and only then installs its new namespace.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import bpy

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import furn_lib as F
import extkit_geometry as G
# These generic helpers are reused rather than copied or altered.
from substation2_build import map_uvs, shared_objects, compact_glb

ROOT=HERE.parent.parent
CATALOGUE=HERE/'extkit.catalog.json'


def hash_file(path):
    raw=path.read_bytes()
    return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}


def make_file(path,items,materials,far):
    F.reset();F.LATHE_K=1.0;entries={};cache={};repeats=0;failures=[]
    for item in items:
        key=item['id']+('_lod1' if far else '')
        asset=F.Asset(key,item)
        G.build(asset,item,far)
        triangles=sum(len(g.I) for g in asset.groups.values())
        cap=2000 if item['smallProp'] else 6000
        if not 0<triangles<=cap: failures.append(f'{key}: {triangles} triangles, cap {cap}')
        lo,hi=asset.bounds();actual=[hi[k]-lo[k] for k in range(3)]
        if not all(math.isfinite(v) for v in lo+hi): failures.append(f'{key}: nonfinite bounds')
        if any(actual[k]>item['size'][k]+.006 for k in range(3)):
            failures.append(f"{key}: actual size {[round(x,5) for x in actual]} exceeds catalogue {item['size']}")
        map_uvs(asset,materials)
        before=len(cache);shared_objects(asset,bpy.context.scene.collection,cache)
        repeats+=len(asset.groups)-(len(cache)-before)
        for name,_,_ in asset.groups:F.get_mat(name).diffuse_color=(1,1,1,1)
        meta={'node':key,'size':item['size'],'footprint':[item['size'][0],item['size'][2]],
              'bounds':{'min':[round(x,6) for x in lo],'max':[round(x,6) for x in hi]},
              'triangles':triangles,'parts':len(asset.groups),'tags':['extkit',item['family']]+(['lod'] if far else []),
              'anchors':item['anchors'],'smallProp':item['smallProp']}
        if not far:meta['lod1']=key+'_lod1'
        entries[key]=meta
        print(f'{key}: {triangles} triangles, {len(asset.groups)} parts; actual {[round(x,4) for x in actual]}',flush=True)
    path.parent.mkdir(parents=True,exist_ok=True)
    F.export_glb(str(path));compact_glb(path)
    result={'glb':'extkit/'+path.name,**hash_file(path),'sharedMeshAliases':repeats,'assets':entries}
    print(f'{path.name}: {result["bytes"]:,} bytes; {repeats} repeated component references',flush=True)
    return result,failures


def install(stage,destination):
    """Commit only our namespace, with rollback of a prior local regeneration."""
    pairs=[('assets/models/extkit/extkit_near.glb','assets/models/extkit/extkit_near.glb'),
           ('assets/models/extkit/extkit_lod.glb','assets/models/extkit/extkit_lod.glb'),
           ('assets/models/manifest.extkit.json','assets/models/manifest.extkit.json')]
    if destination!=ROOT:
        pairs=[('assets/models/extkit/materials.json','assets/models/extkit/materials.json'),
               ('assets/textures/extkit','assets/textures/extkit'),
               ('tools/blender/extkit.catalog.json','tools/blender/extkit.catalog.json')]+pairs
    with tempfile.TemporaryDirectory(prefix='extkit-backup-') as temp:
        backups=[]
        try:
            for i,(src,dst) in enumerate(pairs):
                source=stage/src;target=destination/dst;backup=Path(temp)/str(i)
                target.parent.mkdir(parents=True,exist_ok=True)
                if target.exists():shutil.move(str(target),str(backup))
                backups.append((target,backup))
                if source.is_dir():shutil.copytree(source,target)
                else:shutil.copy2(source,target)
        except BaseException:
            for target,backup in reversed(backups):
                if target.is_dir():shutil.rmtree(target)
                elif target.exists():target.unlink()
                if backup.exists():shutil.move(str(backup),str(target))
            raise


def main():
    if not bpy.app.background:raise RuntimeError('Use Blender --background; visible mode is not supported.')
    if bpy.app.version[0]!=5:raise RuntimeError('This release requires Blender 5.x.')
    bpy.context.scene.render.threads_mode='FIXED';bpy.context.scene.render.threads=2
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=ROOT,help='Project-shaped output root (la-ladera by default).')
    parser.add_argument('--node',default=shutil.which('node') or 'node')
    parser.add_argument('--development',action='store_true',help='Export incomplete development data without the final independent gate.')
    parser.add_argument('--only',help='Comma-separated catalogue IDs; only permitted with an isolated --out.')
    args=parser.parse_args(F.argv_after_dashes());destination=args.out.resolve()
    catalogue=json.loads(CATALOGUE.read_text(encoding='utf-8'));items=catalogue['assets']
    if args.only:
        if destination==ROOT:raise ValueError('Partial builds require an isolated --out root.')
        wanted=set(args.only.split(','));items=[x for x in items if x['id'] in wanted]
        if {x['id'] for x in items}!=wanted:raise ValueError('Unknown --only catalogue ID.')
    materials_path=ROOT/'assets/models/extkit/materials.json'
    if not materials_path.is_file():raise RuntimeError('Generate extkit textures and materials.json first.')
    materials=json.loads(materials_path.read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory(prefix='extkit-stage-') as temp:
        stage=Path(temp)
        for path in ['assets/models/extkit/materials.json','assets/textures/extkit','tools/blender/extkit.catalog.json','assets/models/manifest.json','assets/textures/manifest.json']:
            source=ROOT/path;target=stage/path;target.parent.mkdir(parents=True,exist_ok=True)
            if source.is_dir():shutil.copytree(source,target)
            else:shutil.copy2(source,target)
        # Existing production source is read-only evidence for the dormancy check.
        if (ROOT/'js').is_dir():shutil.copytree(ROOT/'js',stage/'js')
        lib=stage/'assets/models/extkit'
        near,failures=make_file(lib/'extkit_near.glb',items,materials,False)
        far,issues=make_file(lib/'extkit_lod.glb',items,materials,True);failures.extend(issues)
        for item in items:
            n=near['assets'][item['id']]['triangles'];f=far['assets'][item['id']+'_lod1']['triangles']
            if f>n*.4:failures.append(f'{item["id"]}: LOD {f}/{n} exceeds 40%')
        total=near['bytes']+far['bytes']
        if total>4_500_000:failures.append(f'Packed GLB bytes {total} exceed 4,500,000')
        manifest={'version':1,'libraryOnly':True,'complete':not bool(args.only or args.development),
                  'license':'CC0-1.0','generator':'tools/blender/extkit_build.py','blenderVersion':bpy.app.version_string,
                  'units':'m','axes':'+Y up, +Z front','origin':catalogue['origin'],'drawnStrings':[],
                  'files':[near,far],'materials':'extkit/materials.json','catalogue':'tools/blender/extkit.catalog.json',
                  'lodPolicy':{'switchMetres':18,'tinyCullMetres':35,'integration':'Recommendations only; runtime integration is untested.'},
                  'artifacts':[]}
        for directory in ['assets/models/extkit','assets/textures/extkit']:
            for file in sorted((stage/directory).rglob('*')):
                if file.is_file():manifest['artifacts'].append({'path':file.relative_to(stage).as_posix(),**hash_file(file)})
        manifest['artifacts'].append({'path':'tools/blender/extkit.catalog.json',**hash_file(stage/'tools/blender/extkit.catalog.json')})
        manifest_path=stage/'assets/models/manifest.extkit.json'
        manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        if failures:
            print('BUILD GATE FAILURES:\n'+'\n'.join(failures),flush=True)
            if not args.development:raise RuntimeError('Geometry gate failed; no files installed.')
        if not args.development:
            command=[args.node,str(HERE/'extkit_validate.mjs'),'--root',str(stage),'--complete','--json']
            result=subprocess.run(command,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=180,
                                  creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            print(result.stdout,flush=True)
            if result.stderr:print(result.stderr,file=sys.stderr,flush=True)
            if result.returncode:raise RuntimeError('Independent staged validation failed; no files installed.')
            checked=json.loads(result.stdout)
            if not checked.get('ok'):raise RuntimeError('Validator did not return ok:true.')
        install(stage,destination)
    print(f'INSTALLED {len(items)} near/LOD pairs, {total:,} GLB bytes; complete={manifest["complete"]}.',flush=True)


if __name__=='__main__':main()

"""Headless Blender5 substation build using the furniture geometry/export pipeline.

Staged independent validation gates installation. Standard glTF only: positions
and normals float32, colours UNORM8, UVs UNORM16; no decoder or embedded images.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import furn_lib as F
import substation_equipment as E
import substation_site as S
ROOT=HERE.parent.parent
MODELS=ROOT/'assets/models'
CATALOGUE=HERE/'substation2.catalog.json'

def authored_catalogue():
    entries=[]
    for source in [*E.EQUIPMENT_CATALOG,*S.SITE_CATALOG]:
        item=dict(source); item['id']='substation_'+item['id'].removeprefix('substation_')
        item['family']=item.pop('kind',item.get('family','site'))
        if item['id'] in ('substation_transformer_132_33','substation_transformer_33_11'): item['family']='power_transformer'
        item['features']=item.get('features',[])
        item['keepOut']=item.pop('navKeepOut',item.get('keepOut'))
        if item['keepOut'] is None:
            w,_,d=item['size']; item['keepOut']=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]]
        anchors=item.setdefault('anchors',{}); anchors.setdefault('lamps',[]); anchors.setdefault('hinges',[])
        entries.append(item)
    return {'version':1,'units':'m','axes':'+Y up, +Z front','origin':'base, centred X/Z footprint',
            'license':'CC0-1.0','design':'Original vintage132/33/11 kV visual equipment; not engineering-certified.','assets':entries}

def map_uvs(asset,material_data):
    for (name,_,_),g in asset.groups.items():
        u0,v0,u1,v1=material_data['atlas']['tiles'][name]
        lo=[min(uv[k] for uv in g.UV) for k in range(2)]; hi=[max(uv[k] for uv in g.UV) for k in range(2)]
        label='_sign_' in name or '_plate' in name
        if label: lo,hi=[0,0],[1,1]
        mapped=[]
        for uv in g.UV:
            u=(uv[0]-lo[0])/(hi[0]-lo[0]) if hi[0]>lo[0] else .5
            v=(uv[1]-lo[1])/(hi[1]-lo[1]) if hi[1]>lo[1] else .5
            mapped.append((u0+min(1,max(0,u))*(u1-u0),1-(v0+min(1,max(0,v))*(v1-v0))))
        g.UV=mapped
        if label: g.C=[(1.,1.,1.) for _ in g.P]; g.has_col=True

def shared_objects(asset,collection,cache):
    root=F.build_objects(asset,collection)
    for obj in list(root.children):
        mesh=obj.data; offset=Vector(tuple(min(v.co[k] for v in mesh.vertices) for k in range(3)))
        for vertex in mesh.vertices: vertex.co=tuple(round(vertex.co[k]-offset[k],6) for k in range(3))
        obj.location=offset
        signature=hashlib.sha256(repr((
            [tuple(v.co) for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],
            [tuple(v.uv) for v in mesh.uv_layers.active.data],
            [tuple(v.color) for v in mesh.color_attributes.active_color.data] if mesh.color_attributes.active_color else [],
            [tuple(n.vector) for n in mesh.corner_normals],mesh.materials[0].name)).encode()).hexdigest()
        if signature in cache: obj.data=cache[signature]; bpy.data.meshes.remove(mesh)
        else: cache[signature]=mesh
    return root

def compact_glb(path):
    raw=path.read_bytes(); jlen=struct.unpack_from('<I',raw,12)[0]
    g=json.loads(raw[20:20+jlen]); binary=raw[28+jlen:]; semantics={}
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            for name,index in p['attributes'].items(): semantics[index]=name
            if 'indices' in p: semantics[p['indices']]='INDEX'
    formats={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
    widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}; views=[]; chunks=bytearray()
    for index,a in enumerate(g['accessors']):
        old=g['bufferViews'][a['bufferView']]; fmt,bytewidth=formats[a['componentType']]; width=widths[a['type']]
        stride=old.get('byteStride',bytewidth*width); off=old.get('byteOffset',0)+a.get('byteOffset',0)
        rows=[list(struct.unpack_from('<'+fmt*width,binary,off+i*stride)) for i in range(a['count'])]
        if a.get('normalized'):
            divisor={5120:127,5121:255,5122:32767,5123:65535}[a['componentType']]
            rows=[[max(-1,x/divisor) for x in row] for row in rows]
        semantic=semantics.get(index)
        if semantic and semantic.startswith('COLOR_'):
            rows=[[round(max(0,min(1,x))*255) for x in row] for row in rows]; component=5121; normalized=True
        elif semantic and semantic.startswith('TEXCOORD_'):
            rows=[[round(max(0,min(1,x))*65535) for x in row] for row in rows]; component=5123; normalized=True
        elif semantic=='INDEX': component=5123 if max(x[0] for x in rows)<=65535 else 5125; normalized=False
        else: component=5126; normalized=False
        while len(chunks)%4: chunks.append(0)
        start=len(chunks); pack=struct.Struct('<'+formats[component][0]*width)
        for row in rows: chunks.extend(pack.pack(*row))
        view={'buffer':0,'byteOffset':start,'byteLength':len(chunks)-start}
        if 'target' in old: view['target']=old['target']
        views.append(view); a['bufferView']=len(views)-1; a['byteOffset']=0; a['componentType']=component
        if normalized: a['normalized']=True
        else: a.pop('normalized',None)
        for bound,fn in [('min',min),('max',max)]:
            if bound in a: a[bound]=[fn(row[k] for row in rows) for k in range(width)]
    g['bufferViews']=views; g['buffers']=[{'byteLength':len(chunks)}]
    for m in g.get('materials',[]): m['pbrMetallicRoughness']={'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':1}
    body=json.dumps(g,separators=(',',':')).encode(); body+=b' '*((-len(body))%4); chunks+=b'\0'*((-len(chunks))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(body)+len(chunks))+
                     struct.pack('<II',len(body),0x4e4f534a)+body+struct.pack('<II',len(chunks),0x004e4942)+chunks)

def make_file(path,items,material_data,far):
    F.reset(); F.LATHE_K=1.0; entries={}; cache={}; repeats=0
    equipment={x['id'].removeprefix('substation_') for x in E.EQUIPMENT_CATALOG}
    for item in items:
        key=item['id']+('_lod1' if far else ''); a=F.Asset(key,item)
        (E if item['id'].removeprefix('substation_') in equipment else S).build(a,item,far)
        triangles=sum(len(g.I) for g in a.groups.values()); limit=6000 if item['id']=='substation_transformer_132_33' else 3000
        if not 0<triangles<=limit: raise ValueError(f'{key}: {triangles} triangles exceeds {limit}')
        if not all(math.isfinite(v) for v in a.lo+a.hi): raise ValueError(key+': nonfinite bounds')
        map_uvs(a,material_data); before=len(cache); shared_objects(a,bpy.context.scene.collection,cache)
        repeats+=len(a.groups)-(len(cache)-before)
        for name,_,_ in a.groups: F.get_mat(name).diffuse_color=(1,1,1,1)
        lo,hi=a.bounds()
        meta={'node':key,'size':item['size'],'footprint':[item['size'][0],item['size'][2]],
              'bounds':{'min':[round(x,6) for x in lo],'max':[round(x,6) for x in hi]},
              'triangles':triangles,'parts':len(a.groups),'tags':['substation',item['family']]+(['lod'] if far else []),
              'anchors':item['anchors'],'keepOut':item['keepOut']}
        if not far: meta['lod1']=key+'_lod1'
        entries[key]=meta; print(f'{key}: {triangles} tris, {len(a.groups)} parts',flush=True)
    path.parent.mkdir(parents=True,exist_ok=True); F.export_glb(str(path)); compact_glb(path); raw=path.read_bytes()
    print(f'{path.name}: {len(raw):,} bytes; {len(cache)} unique component meshes, {repeats} mesh aliases',flush=True)
    return {'glb':'substation2/'+path.name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
            'sharedMeshAliases':repeats,'assets':entries}

def install(stage,out):
    pairs=[(stage/'assets/models/substation2',out/'substation2'),
           (stage/'assets/textures/substation2',out.parent/'textures/substation2'),
           (stage/'assets/models/manifest.substation2.json',out/'manifest.substation2.json')]
    with tempfile.TemporaryDirectory(prefix='substation-backup-') as tmp:
        saved=[]
        try:
            for i,(src,dst) in enumerate(pairs):
                dst.parent.mkdir(parents=True,exist_ok=True); backup=Path(tmp)/str(i)
                if dst.exists(): shutil.move(str(dst),str(backup))
                saved.append((dst,backup))
                if src.is_dir(): shutil.copytree(src,dst)
                else: shutil.copy2(src,dst)
        except BaseException:
            for dst,backup in reversed(saved):
                if dst.is_dir(): shutil.rmtree(dst)
                elif dst.exists(): dst.unlink()
                if backup.exists(): shutil.move(str(backup),str(dst))
            raise

def main():
    if not bpy.app.background: raise RuntimeError('Refusing visible Blender; use --background')
    if bpy.app.version[0]<5: raise RuntimeError('Substation releases require Blender5.x or newer')
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,default=MODELS); p.add_argument('--only')
    p.add_argument('--node',default=shutil.which('node') or 'node')
    p.add_argument('--atlas-python',default=shutil.which('python3') or 'python3'); p.add_argument('--font')
    p.add_argument('--write-catalogue',action='store_true'); args=p.parse_args(F.argv_after_dashes()); out=args.out.resolve()
    if args.only and out==MODELS.resolve(): raise ValueError('Partial builds cannot overwrite the shipped library')
    source=authored_catalogue()
    if args.write_catalogue:
        if args.only: raise ValueError('Partial builds cannot rewrite the full catalogue')
        CATALOGUE.write_text(json.dumps(source,indent=2)+'\n',encoding='utf-8')
    catalogue=json.loads(CATALOGUE.read_text(encoding='utf-8'))
    if catalogue!=source: raise ValueError('Review changed authored dimensions/anchors and run --write-catalogue')
    items=catalogue['assets']
    if args.only:
        wanted={'substation_'+key.removeprefix('substation_') for key in args.only.split(',')}
        items=[x for x in items if x['id'] in wanted]
        if {x['id'] for x in items}!=wanted: raise ValueError('Unknown --only key')
    with tempfile.TemporaryDirectory(prefix='ladera-substation-stage-') as tmp:
        stage=Path(tmp); lib=stage/'assets/models/substation2'; lib.mkdir(parents=True)
        tex=stage/'assets/textures/substation2'; tex.mkdir(parents=True)
        for rel in ('assets/models/manifest.json','assets/textures/manifest.json','tools/blender/substation2.catalog.json'):
            dst=stage/rel; dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(ROOT/rel,dst)
        plan=MODELS/'substation2/substation2-plan.json'
        if plan.is_file(): shutil.copy2(plan,lib/plan.name)
        command=[args.atlas_python,str(HERE/'substation2_atlas.py'),'--out',str(tex),'--materials',str(lib/'materials.json')]
        if args.font: command+=['--font',args.font]
        subprocess.run(command,check=True,stdin=subprocess.DEVNULL,timeout=180,
                       creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        material_data=json.loads((lib/'materials.json').read_text())
        files=[make_file(lib/'substation2_near.glb',items,material_data,False),make_file(lib/'substation2_lod.glb',items,material_data,True)]
        for item in items:
            near=files[0]['assets'][item['id']]['triangles']; far=files[1]['assets'][item['id']+'_lod1']['triangles']
            if far>near*.4: raise ValueError(f"{item['id']}: LOD {far}/{near} exceeds40%")
        manifest={'version':1,'complete':not bool(args.only),'license':'CC0-1.0','generator':'tools/blender/substation2_build.py',
                  'blenderVersion':bpy.app.version_string,'units':'m','axes':'+Y up, +Z front','files':files,
                  'materials':'substation2/materials.json','plan':'substation2/substation2-plan.json',
                  'lodPolicy':{'switchMetres':22,'tinyCullMetres':45,'towerSwitchMetres':80,
                               'integration':'recommendations only; library is not loaded by the game'}}
        (stage/'assets/models/manifest.substation2.json').write_text(json.dumps(manifest,indent=2)+'\n')
        command=[args.node,str(HERE/'substation2_validate.mjs'),'--root',str(stage),'--json']
        if not args.only: command.append('--complete')
        result=subprocess.run(command,check=False,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=180,
                              creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        if result.returncode:
            print(result.stdout,flush=True); print(result.stderr,file=sys.stderr,flush=True)
            raise RuntimeError('Independent staged validation failed')
        try: checked=json.loads(result.stdout)
        except (ValueError,TypeError) as exc: raise RuntimeError('Validator returned no measured JSON report; no files installed') from exc
        if not checked.get('ok') or checked.get('baseAssets')!=len(items) or checked.get('lodAssets')!=len(items):
            raise RuntimeError('Staged validator did not confirm every exported near/LOD pair')
        print('STAGED VALIDATION PASS: '+json.dumps({k:checked[k] for k in
              ('baseAssets','lodAssets','modelBytes','textureBytes','gpuBytes','sharedMeshAliases')}),flush=True)
        install(stage,out)
    print(f'INSTALLED: {len(items)} near/LOD pairs into {out}; game registries unchanged.',flush=True)

if __name__=='__main__': main()

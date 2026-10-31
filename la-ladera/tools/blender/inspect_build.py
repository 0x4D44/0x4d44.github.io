"""Build the optional close-inspection library through the furniture pipeline.

Run from repository root, with no visible window:
  node la-ladera/tests/memgate.mjs 6 300
  node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
    --python-exit-code 1 --python la-ladera/tools/blender/inspect_build.py

The paper atlas is generated separately by inspect_atlas.py. This command writes
all 24 GLBs (each contains a high and a low node), the measured manifest, and an
explicitly unbound ID map. An existing nonempty ID map is preserved, never guessed.
"""
import argparse
import hashlib
import json
import os
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bpy
import furn_lib as L
import inspect_assets as I

ROOT = HERE.parent.parent
SOURCE_REVISION = '8fa06a5498555afc5dc2b636c06754a4a6b5882c'
STATUS = 'blocked-missing-drawer-baseline'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf8')


def compact_glb(path):
    """Lossless buffer repack except documented 8-bit linear vertex colours.

    Keep float positions/normals and atlas UVs; strip unused UVs from untextured
    materials. No Draco, external decoder, embedded image or build-time JS needed.
    """
    blob = path.read_bytes()
    n = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20+n])
    binary = blob[28+n:]
    old_accessors = doc['accessors']; old_views = doc['bufferViews']
    kept, views, data, index_map = [], [], bytearray(), {}
    comp_bytes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
    components = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

    def accessor(old_index, colour=False):
        key=(old_index,colour)
        if key in index_map: return index_map[key]
        old=old_accessors[old_index]
        view=old_views[old['bufferView']]
        width=components[old['type']]*comp_bytes[old['componentType']]
        stride=view.get('byteStride',width)
        offset=view.get('byteOffset',0)+old.get('byteOffset',0)
        chunk=b''.join(binary[offset+i*stride:offset+i*stride+width] for i in range(old['count']))
        a=dict(old); a.pop('byteOffset',None)
        if colour and old['componentType']==5126:
            values=struct.unpack('<'+'f'*(len(chunk)//4),chunk)
            chunk=bytes(max(0,min(255,round(v*255))) for v in values)
            a['componentType']=5121; a['normalized']=True
            a.pop('min',None); a.pop('max',None)
        while len(data)%4: data.append(0)
        new_view={'buffer':0,'byteOffset':len(data),'byteLength':len(chunk)}
        if 'target' in view: new_view['target']=view['target']
        # Normalized VEC3 colours need a padded stride; Blender emits VEC4.
        if colour and a['type']=='VEC3' and a['componentType']==5121:
            chunk=b''.join(chunk[i:i+3]+b'\xff' for i in range(0,len(chunk),3))
            a['type']='VEC4';new_view['byteLength']=len(chunk)
        data.extend(chunk)
        a['bufferView']=len(views); views.append(new_view)
        new_index=len(kept); kept.append(a);index_map[key]=new_index
        return new_index

    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            material=doc['materials'][primitive['material']]['name']
            attributes=primitive['attributes']
            if material not in ('inspect_paper_atlas','inspect_metal_atlas'): attributes.pop('TEXCOORD_0',None)
            primitive['attributes']={name:accessor(idx,name=='COLOR_0') for name,idx in attributes.items()}
            primitive['indices']=accessor(primitive['indices'])
    doc['accessors']=kept;doc['bufferViews']=views
    doc['buffers']=[{'byteLength':len(data)}]
    doc['asset']['generator']='La Ladera inspect_build.py / Blender '+bpy.app.version_string
    doc['asset']['extras']={'source':'Original procedural meshes; furn_lib exporter',
                            'units':'metres','axes':'X right, Y up, Z front',
                            'colourPacking':'8-bit normalized linear RGBA'}
    js=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode('utf8')
    js+=b' '*((-len(js))%4);data+=b'\0'*((-len(data))%4)
    out=struct.pack('<III',0x46546c67,2,28+len(js)+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data
    path.write_bytes(out)


def centre(A):
    points=[g.P[i] for g in A.groups.values() for tri in g.I for i in tri]
    lo=[min(p[i] for p in points) for i in range(3)]
    hi=[max(p[i] for p in points) for i in range(3)]
    mid=[(lo[i]+hi[i])/2 for i in range(3)]
    for (mat,_,_),g in A.groups.items():
        g.P=[tuple(p[i]-mid[i] for i in range(3)) for p in g.P]
        # Blender glTF flips V. MaterialLib uses TextureLoader (flipY=true), so
        # pre-compensate once to preserve bottom-left game UVs in the final GLB.
        if mat in ('inspect_paper_atlas','inspect_metal_atlas'):
            g.UV=[(u,1-v) for u,v in g.UV]
        else:
            # MaterialLib enables vertexColors by default. An absent COLOR_0
            # becomes black in its shader; explicit white is the neutral tint.
            g.has_col=True
    A.lo=[lo[i]-mid[i] for i in range(3)];A.hi=[hi[i]-mid[i] for i in range(3)]


def measurements(A):
    lo,hi=A.bounds()
    return {'triangles':sum(len(g.I) for g in A.groups.values()),
            'drawCalls':sum(bool(g.I) for g in A.groups.values()),
            'bounds':{'min':[round(v,9) for v in lo],'max':[round(v,9) for v in hi]},
            'size':[round(hi[i]-lo[i],9) for i in range(3)]}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,default=ROOT/'assets/models')
    parser.add_argument('--only',help='Comma-separated names; diagnostic export only, never overwrites complete manifest')
    args=parser.parse_args(L.argv_after_dashes() if '--' in sys.argv else [])
    out=args.out.resolve();(out/'inspect').mkdir(parents=True,exist_ok=True)
    atlas_path=ROOT/'assets/textures/inspect_paper_atlas.json'
    atlas=json.loads(atlas_path.read_text(encoding='utf8'));I.TILES=atlas['tiles']
    only=set(args.only.split(',')) if args.only else None
    if only:
        unknown=only-set(I.BUILDERS)-{'inspect_'+k for k in I.BUILDERS}
        if unknown: raise ValueError('Unknown --only keys: '+str(sorted(unknown)))
    files=[];inventory=[]
    for short,(label,category,builder) in I.BUILDERS.items():
        key='inspect_'+short
        if only and short not in only and key not in only: continue
        L.reset(); assets={}
        for low in (False,True):
            name=key+('_lod' if low else '')
            A=I.InspectAsset(name,{'size':[1,1,1]});builder(A,low);centre(A)
            meta={'node':name,'label':label,'category':category,'tags':['inspect','lod' if low else 'detail'],**measurements(A)}
            limit=700 if low else 3000
            if meta['triangles']>limit: raise ValueError(f"{name}: {meta['triangles']} > {limit} triangles")
            meta.update({'lodOf':key} if low else {'lod':key+'_lod'})
            L.build_objects(A,bpy.context.scene.collection); assets[name]=meta
        rel='inspect/'+key+'.glb';path=out/rel
        L.export_glb(str(path));compact_glb(path)
        files.append({'glb':rel,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'assets':assets})
        inventory.append({'key':key,'label':label,'category':category})
        print(f"INSPECT {key}: {assets[key]['triangles']} / {assets[key+'_lod']['triangles']} triangles, {path.stat().st_size} bytes",flush=True)
    if only:
        print('Diagnostic subset generated; complete manifest and ID map left unchanged.')
        return
    bindings_path=ROOT/'js/interiors/inspect-bindings.json'
    bindings=json.loads(bindings_path.read_text(encoding='utf8')) if bindings_path.exists() else {
        'version':1,'status':STATUS,'sourceRevision':SOURCE_REVISION,
        'requiredSources':['dev/FEATURE-DRAWERS.md','js/interiors/finds.js','js/interiors/contents.js'],
        'bindings':{},
        'note':'The named drawer source files are absent from origin/main at sourceRevision. Asset keys below are new library keys, not claimed existing find IDs. Populate verified bindings only when the source revision is supplied.'}
    bindings['assets']=inventory
    write_json(bindings_path,bindings)
    manifest={'version':1,'sourceRevision':SOURCE_REVISION,'integrationStatus':bindings.get('status',STATUS),
              'budgetBytes':2000000,'maxTriangles':3000,'maxLodTriangles':700,
              'units':'metres','axes':'+X right, +Y up, +Z front','pivot':'centred bounding box',
              'bindingMap':{'dir':'../..','path':'js/interiors/inspect-bindings.json'},
              'atlas':{'dir':'../..','path':'assets/textures/inspect_paper_atlas.png','metadata':'assets/textures/inspect_paper_atlas.json',
                       'sha256':atlas['sha256'],'width':atlas['width'],'height':atlas['height']},
              'files':files}
    write_json(out/'manifest.inspect.json',manifest)
    print(f'Wrote {len(files)} GLBs / {len(files)*2} nodes and measured manifest; bindings status: {bindings["status"]}')


if __name__=='__main__': main()

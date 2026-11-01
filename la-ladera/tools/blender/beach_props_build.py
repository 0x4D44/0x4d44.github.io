"""Build the dormant La Ladera beach library with Blender 5.x.

node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
  --python-exit-code 1 --python la-ladera/tools/blender/beach_props_build.py

Geometry, PBR maps and a binary-measured manifest are staged, independently
validated and installed together. A filtered preview cannot replace production.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bpy
import furn_lib as L
import beach_props_geometry as G
import beach_props_structures as S
import beach_props_atlas as A
from beach_props_atlas import write_atlas

ROOT = HERE.parent.parent
CATALOGUE = HERE / 'beach_props.catalog.json'


def catalogue_data():
    assets = {**G.CATALOG, **S.CATALOG}
    defaults = {'beach_cool_box':['plastic_blue'], 'beach_thermos':['steel'],
                'beach_flipflops_pair':['plastic_blue'], 'beach_flipflop_left':['plastic_blue'],
                'beach_flipflop_right':['plastic_coral'], 'beach_bucket_spade':['plastic_yellow'],
                'beach_sandcastle':['sand'], 'beach_ball_buried':['ball'],
                'beach_pool_ring_deflated':['plastic_coral'], 'beach_volleyball_ball':['volleyball'],
                'beach_seawall_stones':['seawall'], 'beach_shell_conch':['conch'],
                'beach_shell_scallop':['scallop'],
                'beach_kiosk':['thatch','wood_teak'], 'beach_vendor_cart':['parasol_03','rubber'],
                'beach_cooler_stand':['plastic_blue'], 'beach_sign_easel':['menu'],
                'beach_lifeguard_tower':['paint_white','paint_red'], 'beach_rescue_buoy':['paint_red'],
                'beach_first_aid':['first_aid'], 'beach_red_flag':['flag_red'], 'beach_lamp':['steel'],
                'beach_bench':['wood_weathered'], 'beach_bin':['wood_weathered'],
                'beach_bike_rack':['steel'], 'beach_fountain':['paint_white'], 'beach_railing':['paint_white'],
                'beach_steps_small':['seawall'], 'beach_steps_medium':['seawall'], 'beach_steps_wide':['seawall'],
                'beach_shower':['steel']}
    for key, cat in assets.items():
        if cat['family']=='rescue':cat['family']='lifeguard'
        cat.setdefault('pivots', [])
        cat.setdefault('anchors', {})
        if any(p.get('motion') in ('hinge','flap') for p in cat['pivots']):
            cat['anchors'].setdefault('hinges',[{k:p[k] for k in ('name','position','axis')} for p in cat['pivots'] if p.get('motion') in ('hinge','flap')])
        if 'atlasCells' not in cat:
            cat['atlasCells'] = defaults.get(key, ['rock_salt'] if 'groyne' in key else ['driftwood'])
    return {'version':1, 'units':'metres', 'axes':'+Y up, +Z front', 'origin':'floor-centre',
            'library':'beach_props', 'assets':assets}


def build_prop(key, cat, lod):
    return S.build(key, cat, lod) if key in S.CATALOG else G.build(key, cat, lod)


def count(p):
    return sum(len(g.I) for s in [p.body]+[p['surface'] for p in p.pivots] for g in s.groups.values())


def surface_objects(surface, cache):
    root = L.build_objects(surface, bpy.context.scene.collection)
    groups = [(mat, g) for (mat, _tint, _flags), g in surface.groups.items() if g.I]
    for child, (mat, g) in zip(root.children, groups):
        signature = hashlib.sha256(json.dumps([mat,g.P,g.N,g.UV,g.I],separators=(',',':')).encode()).digest()
        if signature in cache:
            old = child.data; child.data = cache[signature]
            if not old.users:bpy.data.meshes.remove(old)
        else:cache[signature] = child.data
    return root


def create_prop(p, cache):
    root = surface_objects(p.body, cache)
    for part in p.pivots:
        pivot = surface_objects(part['surface'], cache)
        pivot.parent = root
        pivot.location = L.to_blender(part['position'])
        pivot['axis'] = part['axis']; pivot['motion'] = part['motion']
    return root


def material_contract(path):
    """Pin library material flags across Blender minor exporter versions.

The GLB still has no texture payload. Runtime material resolution is by name;
PBR bindings are in the dormant manifest. This modifies only material flags.
"""
    data=path.read_bytes();jlen=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+jlen]);binheader=20+jlen
    blen=struct.unpack_from('<I',data,binheader)[0];binary=data[binheader+8:binheader+8+blen]
    for mat in doc.get('materials',[]):
        mat['pbrMetallicRoughness']={'baseColorFactor':[1,1,1,1], 'metallicFactor':0, 'roughnessFactor':1}
        mat.pop('extensions',None)
        mat['doubleSided']=True
        mat['alphaMode']='MASK' if mat['name']=='beach_props_alpha' else 'OPAQUE'
        if mat['alphaMode']=='MASK':mat['alphaCutoff']=.5
    doc.pop('extensionsUsed',None);doc.pop('extensionsRequired',None)
    js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+
                     struct.pack('<II',len(js),0x4e4f534a)+js+
                     struct.pack('<II',len(binary),0x004e4942)+binary)


def inspect(path, node):
    script=('import {inspectBeachGlb} from '+json.dumps((HERE/'beach_props_validate.mjs').as_uri())+';'
            'const r=inspectBeachGlb(process.argv[1]);console.log(JSON.stringify({assets:[...r.assets.values()],sharedMeshes:r.sharedMeshes}));')
    return json.loads(subprocess.check_output([node,'--input-type=module','-e',script,str(path)],text=True))


def reuse_atlas(source, target):
    """Optional geometry-only rebuild: still decode and hash all maps at the gate."""
    target.mkdir(parents=True,exist_ok=True);maps={}
    for name in ('albedo','normal','orm'):
        data=(source/(name+'.png')).read_bytes();(target/(name+'.png')).write_bytes(data)
        maps[name]={'path':'../textures/beach_props/'+name+'.png','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    return {'width':A.WIDTH,'height':A.HEIGHT,'grid':A.GRID,'cellSize':A.CELL,'gutter':A.GUTTER,
            'maps':maps,'cells':A.CELL_MAP,'tiles':A.atlas_tiles(),'alphaCells':[32,33,34],
            'signTexts':A.SIGN_TEXTS,'uvConvention':'bottom-origin; row 0 is the bottom PNG row of cells',
            'channels':{'normal':'tangent-space +Y/OpenGL','orm':'R occlusion, G roughness, B metalness'},
            'totalBytes':sum(m['bytes'] for m in maps.values()),'license':'CC0-1.0'}


def install(staged, out):
    targets=[(staged/'models/beach_props',out/'beach_props'),
             (staged/'textures/beach_props',out.parent/'textures/beach_props'),
             (staged/'models/manifest.beach_props.json',out/'manifest.beach_props.json')]
    prepared=[];backup=[];written=[];preserve_backups=False
    try:
        # Prepare every copy on its destination filesystem first. A copy error
        # cannot damage any live library, even when staging is on another drive.
        for source,target in targets:
            target.parent.mkdir(parents=True,exist_ok=True)
            local=Path(tempfile.mkdtemp(prefix='.beach-props-install-',dir=target.parent))
            prepared.append((local,target))
            if source.is_dir():shutil.copytree(source,local/'new')
            else:shutil.copy2(source,local/'new')
        for local,target in prepared:
            if target.exists():
                old=local/'old';target.rename(old);backup.append((old,target))
            written.append(target);(local/'new').rename(target)
    except BaseException:
        try:
            for target in reversed(written):
                if target.is_dir():shutil.rmtree(target)
                elif target.exists():target.unlink()
            for source,target in reversed(backup):source.rename(target)
        except BaseException:
            preserve_backups=True
            print('Installation rollback needs recovery; retained staging: '+', '.join(str(p) for p,_ in prepared),file=sys.stderr,flush=True)
            raise
        raise
    finally:
        if not preserve_backups:
            for local,_target in prepared:shutil.rmtree(local,ignore_errors=True)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out',type=Path,default=ROOT/'assets/models')
    ap.add_argument('--only',help='comma-separated keys; requires a separate --out')
    ap.add_argument('--node',default='node')
    ap.add_argument('--counts',action='store_true')
    ap.add_argument('--atlas-from',type=Path,help='reuse an already generated atlas for geometry-only iteration; all texture checks still run')
    ap.add_argument('--write-catalogue',action='store_true',help='explicitly regenerate the human-readable catalogue')
    opt=ap.parse_args(L.argv_after_dashes() if '--' in sys.argv else [])
    if bpy.app.version[0]!=5:raise RuntimeError('This library requires Blender 5.x')
    generated=catalogue_data()
    if opt.write_catalogue:
        CATALOGUE.write_text(json.dumps(generated,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
        print(f'Wrote {len(generated["assets"])} catalogue items');return
    catbytes=CATALOGUE.read_bytes();document=json.loads(catbytes);catalog=document['assets']
    if document!=generated:raise ValueError('Catalogue differs from authored metadata; use --write-catalogue after intentional metadata edits')
    selected=set(opt.only.split(',')) if opt.only else set(catalog)
    if selected-set(catalog):raise ValueError('Unknown keys: '+str(sorted(selected-set(catalog))))
    out=opt.out.resolve();shipped=(ROOT/'assets/models').resolve()
    assets_root=(ROOT/'assets').resolve()
    if not opt.counts:
        if opt.only and (out==assets_root or assets_root in out.parents):
            raise ValueError('Filtered preview requires --out outside the production assets tree')
        production={(shipped/'beach_props').resolve(),(shipped/'manifest.beach_props.json').resolve(),(ROOT/'assets/textures/beach_props').resolve()}
        owned={(out/'beach_props').resolve(),(out/'manifest.beach_props.json').resolve(),(out.parent/'textures/beach_props').resolve()}
        if out!=shipped and owned & production:
            raise ValueError('Custom --out aliases a production library destination')
    if opt.counts:
        bad=[]
        for key,cat in catalog.items():
            if key not in selected:continue
            near,far=[count(build_prop(key,cat,lod)) for lod in (0,1)]
            status='PASS' if near<=cat['triangleCap'] and far<=near*.4 else 'FAIL'
            print(f'{status} {key}: {near}/{far} triangles ({far/near:.1%})')
            if status=='FAIL':bad.append(key)
        if bad:raise ValueError('Triangle budgets: '+', '.join(bad))
        return
    out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ladera-beach-props-') as tmp:
        staged=Path(tmp);models=staged/'models';(models/'beach_props').mkdir(parents=True)
        textures=(reuse_atlas(opt.atlas_from,staged/'textures/beach_props') if opt.atlas_from else write_atlas(staged/'textures/beach_props'))
        families={'leisure':['lounge','towel','beach'], 'civic':['vendor','lifeguard','promenade','sign','sport'], 'shore':['shore','plant']}
        files=[]
        for group,families_here in families.items():
            keys=[key for key,cat in catalog.items() if key in selected and cat['family'] in families_here]
            if not keys:continue
            L.reset();cache={}
            for key in keys:
                for lod in (0,1):
                    p=build_prop(key,catalog[key],lod)
                    create_prop(p,cache)
            rel=f'beach_props/beach_{group}.glb';path=models/rel
            L.export_glb(str(path));material_contract(path)
            data=path.read_bytes();measured=inspect(path,opt.node);assets={}
            for a in measured['assets']:
                name=a['key'];low=name.endswith('_lod1');key=name[:-5] if low else name;cat=catalog[key]
                meta={'node':name,'size':cat['size'],'footprint':cat['footprint'],'origin':'floor-centre',
                      'tags':['beach-prop-lod' if low else 'beach-prop',cat['family']],
                      'triangles':a['triangles'],'parts':a['parts'],'bounds':{'min':a['min'],'max':a['max']},
                      'anchors':cat['anchors'],'pivots':cat['pivots'],'atlasCells':cat['atlasCells'],
                      'description':cat['description']}
                if low:meta['lod']=1
                else:meta['lod1']=key+'_lod1'
                assets[name]=meta
            files.append({'glb':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'sharedMeshes':measured['sharedMeshes'],'assets':assets})
            print(f'{rel}: {len(assets)} roots, {len(data):,} bytes',flush=True)
        mats={}
        for name in ('beach_props','beach_props_alpha'):
            mats[name]={'map':textures['maps']['albedo']['path'],'normal':textures['maps']['normal']['path'],
                        'orm':textures['maps']['orm']['path'],'uv':'unit','doubleSided':True,
                        'alphaMode':'MASK' if name.endswith('_alpha') else 'OPAQUE'}
            if name.endswith('_alpha'):mats[name]['alphaCutoff']=.5
        manifest={'version':1,'complete':selected==set(catalog),'license':'CC0-1.0','units':'metres',
                  'generator':{'script':'tools/blender/beach_props_build.py','blender':bpy.app.version_string,
                               'catalogSha256':hashlib.sha256(catbytes.replace(b'\r\n',b'\n')).hexdigest()},
                  'assetCount':len(selected),'lodCount':len(selected),'totalGlbBytes':sum(f['bytes'] for f in files),
                  'totalTextureBytes':sum(t['bytes'] for t in textures['maps'].values()),
                  'textures':textures,'materials':mats,'files':files}
        (models/'manifest.beach_props.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
        cmd=[opt.node,str(HERE/'beach_props_validate.mjs'),'--models',str(models)]
        if manifest['complete']:cmd.append('--complete')
        validation=subprocess.run(cmd,text=True,capture_output=True)
        if validation.stdout:print(validation.stdout,flush=True)
        if validation.stderr:print(validation.stderr,file=sys.stderr,flush=True)
        validation.check_returncode()
        install(staged,out)
    print(f'Installed {len(selected)} beach props + far LODs; {manifest["totalGlbBytes"]:,} GLB bytes; {manifest["totalTextureBytes"]:,} texture bytes',flush=True)


if __name__=='__main__':main()

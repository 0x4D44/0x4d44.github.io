"""Build the complete original parked-vehicle library with Blender 4.5 LTS.

  node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
    --python-exit-code 1 --python la-ladera/tools/blender/vehicles_build.py

Uses the furniture geometry and glTF exporter. Exported GLBs have named wheel
axle pivots and shared mesh data, explicit near/far roots, and no images. The
shared paint PNG, binary-derived manifest and independent validator are staged
before installation. A filtered preview cannot overwrite the shipped library.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path: sys.path.insert(0,str(HERE))
import bpy
import furn_lib as L
import vehicles_geometry as G
from vehicles_atlas import write_atlas

ROOT = HERE.parent.parent
CATALOGUE = HERE / 'vehicles.catalog.json'


def arguments():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,default=ROOT/'assets/models')
    p.add_argument('--only',help='comma-separated keys; preview only and requires a scratch --out')
    p.add_argument('--node',default='node')
    p.add_argument('--counts',action='store_true',help='print authored geometry counts without exporting')
    return p.parse_args(L.argv_after_dashes() if '--' in sys.argv else [])


def sumtris(a): return sum(len(g.I) for g in a.groups.values())


def wheel_asset(name,cat,wheel,lod):
    a=G.Surface(name,cat)
    G.tire(a,wheel['radius'],wheel['width'],lod,wheel['spokes'])
    return a


def create_vehicle(v,cache):
    root=L.build_objects(v.body,bpy.context.scene.collection)
    for w in v.wheels:
        name=v.key+'-wheel_'+w['code']
        ident=(w['radius'],w['width'],w['spokes'],v.lod)
        if ident not in cache:
            a=wheel_asset(name,v.cat,w,v.lod)
            pivot=L.build_objects(a,bpy.context.scene.collection)
            cache[ident]=[child.data for child in pivot.children]
        else:
            pivot=bpy.data.objects.new(name,None)
            bpy.context.scene.collection.objects.link(pivot)
            for i,data in enumerate(cache[ident]):
                ob=bpy.data.objects.new(name+'-'+str(i),data)
                bpy.context.scene.collection.objects.link(ob);ob.parent=pivot
        pivot.parent=root
        pivot.location=L.to_blender(w['position'])
    return root


def inspect(path,node):
    # The manifest records the independent inspector's measurements of the
    # exported bytes, including each drawn wheel instance, not builder guesses.
    script=("import { inspectVehicleGlb } from "+json.dumps((HERE/'vehicles_validate.mjs').as_uri())+";"
            "const r=inspectVehicleGlb(process.argv[1]);console.log(JSON.stringify([...r.assets.values()]));")
    output=subprocess.check_output([node,'--input-type=module','-e',script,str(path)],text=True)
    return json.loads(output)


def install(staged,out,atlas_out):
    """Publish the manifest last, restoring every previous owned file on failure."""
    out.mkdir(parents=True,exist_ok=True);atlas_out.parent.mkdir(parents=True,exist_ok=True)
    targets=[(staged/'models/vehicles',out/'vehicles'),
             (staged/'textures/vehicles/paint.png',atlas_out),
             (staged/'models/manifest.vehicles.json',out/'manifest.vehicles.json')]
    backed=[];written=[]
    try:
        for i,(source,target) in enumerate(targets):
            if target.exists():
                backup=staged/('previous-'+str(i));target.rename(backup);backed.append((backup,target))
            source.rename(target);written.append(target)
    except BaseException:
        for target in reversed(written):
            if target.is_dir():shutil.rmtree(target)
            elif target.exists():target.unlink()
        for backup,target in reversed(backed):backup.rename(target)
        raise


def main():
    opt=arguments();out=opt.out.resolve();shipped=(ROOT/'assets/models').resolve()
    cat_bytes=CATALOGUE.read_bytes();catalog=json.loads(cat_bytes)['assets']
    only=set(opt.only.split(',')) if opt.only else set(catalog)
    if only-set(catalog):raise ValueError('Unknown vehicle keys: '+', '.join(sorted(only-set(catalog))))
    partial=only!=set(catalog)
    if opt.only and out==shipped and not opt.counts:
        raise ValueError('Filtered preview requires --out outside shipped assets/models')
    if set(G.BUILDERS)!=set(catalog):raise ValueError('Builders and catalogue do not match')
    if opt.counts:
        for key,cat in catalog.items():
            if key not in only:continue
            for lod in (0,1):
                v=G.build(key,cat,lod)
                wheelcounts=[sumtris(wheel_asset('wheel',cat,w,lod)) for w in v.wheels]
                print(f'{v.key}: body={sumtris(v.body)} wheels={wheelcounts} total={sumtris(v.body)+sum(wheelcounts)}',flush=True)
        return
    out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.vehicles-build-',dir=out) as tmp:
        staged=Path(tmp);models=staged/'models';(models/'vehicles').mkdir(parents=True)
        atlas_path=staged/'textures/vehicles/paint.png'
        atlas=write_atlas(atlas_path)
        files=[]
        # The two files separate full-size motor vehicles from narrow cycles
        # and carts, and each contains both LODs. Shared wheels reduce bytes.
        families={'road':['vehicle_hatchback_a','vehicle_hatchback_b','vehicle_pickup','vehicle_chiva','vehicle_colectivo'],
                  'street':['vehicle_motorbike','vehicle_tricycle','vehicle_handcart','vehicle_bicycle','vehicle_rubbish_cart']}
        for family,keys in families.items():
            keys=[key for key in keys if key in only]
            if not keys:continue
            L.reset();cache={}
            for key in keys:
                for lod in (0,1):
                    v=G.build(key,catalog[key],lod)
                    create_vehicle(v,cache)
            rel='vehicles/vehicles_'+family+'.glb';path=models/rel
            L.export_glb(str(path));data=path.read_bytes();assets={}
            for measured in inspect(path,opt.node):
                name=measured['key'];lod=name.endswith('_lod1');key=name[:-5] if lod else name;cat=catalog[key]
                count=measured['triangles'];limit=600 if lod else 6000
                if count>limit:raise ValueError(f'{name}: {count} triangles exceeds {limit}')
                meta={'node':name,'size':cat['size'],'footprint':cat['footprint'],
                      'tags':['vehicle-lod' if lod else 'vehicle',cat['family']],
                      'origin':'floor-centre','triangles':count,'parts':measured['parts'],
                      'bounds':{'min':measured['min'],'max':measured['max']},
                      'wheels':[w['name'] for w in measured['wheels']],
                      'paintTile':cat['paintTile'],'description':cat['description']}
                if lod:meta['lod']=1
                else:
                    meta['lod1']=key+'_lod1'
                    meta['variants']=['faded','rust','mud']
                    if 'seatRest' in cat:meta['seatRest']=cat['seatRest']
                assets[name]=meta
                print(f'{name:30s} {count:4d} triangles {measured["parts"]:2d} parts bounds={meta["bounds"]}',flush=True)
            files.append({'glb':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'assets':assets})
        total=sum(f['bytes'] for f in files)+atlas['bytes']
        manifest={'version':1,'complete':not partial,'license':'CC0-1.0',
                  'generator':{'script':'tools/blender/vehicles_build.py','blender':bpy.app.version_string,
                               'catalogSha256':hashlib.sha256(cat_bytes.replace(b'\r\n', b'\n')).hexdigest()},
                  'assetCount':len(only),'lodCount':len(only),'totalBytes':total,'atlas':atlas,'files':files}
        manifest_data=(json.dumps(manifest,indent=2)+'\n').encode('utf8')
        (models/'manifest.vehicles.json').write_bytes(manifest_data)
        if total+len(manifest_data)>3_000_000:raise ValueError(f'Vehicle payload {total+len(manifest_data):,} exceeds 3,000,000 bytes')
        command=[opt.node,str(HERE/'vehicles_validate.mjs'),'--models',str(models),'--atlas',str(atlas_path)]
        if not partial:command.append('--complete')
        validation=subprocess.run(command,text=True,capture_output=True)
        if validation.stdout:print(validation.stdout,flush=True)
        if validation.stderr:print(validation.stderr,file=sys.stderr,flush=True)
        validation.check_returncode()
        atlas_out=out.parent/'textures/vehicles/paint.png'
        install(staged,out,atlas_out)
    print(f'Installed {len(only)} vehicles + far LODs, {total+len(manifest_data):,} bytes including atlas and manifest',flush=True)


if __name__=='__main__':main()

"""Quiet Blender 5.x builder for the shared UK/Colombian substation library.

node la-ladera/tools/nice.mjs --idle blender --background --factory-startup \
  --python-exit-code 1 --python la-ladera/tools/blender/substation_build.py

Textures are generated separately by substation_atlas.py using Pillow and
Tesseract. This builder stages a copy of that independently checked atlas set,
exports named near/far roots, constructs the manifest from decoded GLB bytes,
validates, and only then replaces the owned library directories.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import bpy
import furn_lib as L
import substation_common as C
import substation_equipment as E

ROOT = HERE.parent.parent
CATALOGUE = HERE / 'substation.catalog.json'


def args():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,default=ROOT/'assets/models')
    p.add_argument('--only',help='comma-separated roots; requires a separate preview --out')
    p.add_argument('--node',default='node')
    p.add_argument('--counts',action='store_true')
    p.add_argument('--geometry-only',action='store_true',help='raw development export; requires separate --out')
    return p.parse_args(L.argv_after_dashes() if '--' in sys.argv else [])


def export(path):
    import logging
    logging.disable(logging.INFO)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,
        export_apply=False,export_materials='EXPORT',export_image_format='NONE',
        export_vertex_color='ACTIVE',export_cameras=False,export_lights=False,
        export_normals=True,export_texcoords=True,export_extras=True)


def run(command):
    process=subprocess.run(command,text=True,capture_output=True,stdin=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    if process.stdout:
        print(process.stdout,flush=True)
    if process.stderr:
        print(process.stderr,file=sys.stderr,flush=True)
    process.check_returncode()


def install(staged,out):
    """Install only owned paths; manifest last; restore previous files on failure."""
    targets=[(staged/'models/substation',out/'substation'),
             (staged/'textures/substation',out.parent/'textures/substation'),
             (staged/'models/manifest.substation.json',out/'manifest.substation.json')]
    backups=[];written=[]
    try:
        for i,(source,target) in enumerate(targets):
            target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists():
                backup=staged/('previous-'+str(i))
                shutil.move(str(target),str(backup));backups.append((backup,target))
            written.append(target)
            shutil.move(str(source),str(target))
    except BaseException:
        for target in reversed(written):
            if target.is_dir():
                shutil.rmtree(target)
            elif target.exists():
                target.unlink()
        for backup,target in reversed(backups):
            shutil.move(str(backup),str(target))
        raise


def main():
    opt=args();out=opt.out.resolve();shipped=(ROOT/'assets/models').resolve()
    if ((opt.only or opt.geometry_only) and out==shipped or shipped in out.parents) and not opt.counts:
        raise ValueError('Filtered/raw preview requires --out outside shipped assets/models')
    cat=json.loads(CATALOGUE.read_text(encoding='utf8'))['assets']
    only=set(opt.only.split(',')) if opt.only else set(cat)
    if only-set(cat):
        raise ValueError('Unknown keys: '+', '.join(sorted(only-set(cat))))
    if any(not cat[k]['shared'] for k in only):
        import substation_site as site
    else:
        site=None
    build=lambda key,lod: E.build(key,cat[key],lod) if cat[key]['shared'] else site.build(key,cat[key],lod)
    if opt.counts:
        for key in cat:
            if key not in only:
                continue
            near,far=build(key,0),build(key,1)
            bounds=near.bounds();dimensions=[round(bounds[1][i]-bounds[0][i],4) for i in range(3)]
            print(f'{key}: near={near.triangles()} far={far.triangles()} ratio={far.triangles()/near.triangles():.3f} authored={dimensions} target={cat[key]["size"]}',flush=True)
        return
    out.mkdir(parents=True,exist_ok=True)
    # Keep transient geometry outside the shipped tree, including while a
    # validator runs. A concurrent payload scan must never count staging data.
    with tempfile.TemporaryDirectory(prefix='ladera-substation-build-') as tmp:
        staged=Path(tmp);models=staged/'models';(models/'substation').mkdir(parents=True)
        for variant in ('shared','uk','co'):
            keys=[key for key in cat if key in only and cat[key]['variant']==variant]
            if not keys:
                continue
            C.reset()
            for key in keys:
                near=build(key,0);far=build(key,1)
                cap=6000 if key in ('substation_grid_transformer','substation_distribution_transformer') else 3000
                if near.triangles()>cap or far.triangles()>.4*near.triangles():
                    raise ValueError(f'{key}: triangle budget: {near.triangles()} near, {far.triangles()} far, cap {cap}, ratio cap .4')
                near.create();far.create()
                print(f'{key}: {near.triangles()} near / {far.triangles()} far triangles',flush=True)
            path=models/'substation'/('substation_'+variant+'.glb')
            export(path)
            print(f'EXPORTED {path.name}: {path.stat().st_size} bytes',flush=True)
            inspection=('import {inspectSubstationGlb} from '+json.dumps((HERE/'substation_validate.mjs').as_uri())+';'
                        'const r=inspectSubstationGlb(process.argv[1]);'
                        'console.log(JSON.stringify({decodedRoots:r.assets.size,bytes:r.bytes,triangles:[...r.assets.values()].reduce((n,a)=>n+a.triangles,0)}));')
            run([opt.node,'--input-type=module','-e',inspection,str(path)])
        total=sum(p.stat().st_size for p in (models/'substation').glob('*.glb'))
        if total>6_000_000:
            raise ValueError(f'Model budget exceeded: {total} > 6000000')
        if opt.geometry_only:
            target=out/'substation';target.mkdir(exist_ok=True)
            for path in (models/'substation').glob('*.glb'):
                shutil.copy2(path,target/path.name)
            print(f'Raw geometry preview written: {total} bytes; no complete manifest installed',flush=True)
            return
        textures=ROOT/'assets/textures/substation'
        if not (textures/'atlas.json').is_file():
            raise ValueError('Generate substation atlases first with substation_atlas.py')
        shutil.copytree(textures,staged/'textures/substation')
        command=[opt.node,str(HERE/'substation_manifest.mjs'),'--models',str(models),'--project',str(ROOT),'--blender',bpy.app.version_string]
        if only!=set(cat):
            command.append('--partial')
        run(command)
        validation=[opt.node,str(HERE/'substation_validate.mjs'),'--models',str(models),'--project',str(ROOT)]
        if only==set(cat):
            validation.append('--complete')
        run(validation)
        install(staged,out)
    print(f'Installed {len(only)} substation assets and far LODs; {total} GLB bytes',flush=True)


if __name__=='__main__':
    main()

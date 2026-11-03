"""Build the optional adult wearable library without changing the default cast.

Run from the repository root:
  node la-ladera/tools/nice.mjs python la-ladera/tools/blender/people_wear_build.py

Original generated body/garment patterns, existing CC0-derived resident identities,
the exact source skeletons, and the Part A colours/prints. NumPy, SciPy, Pillow and
manifold3d are authoring-only dependencies. No Blender UI or network request is
opened. After generation, run --fit-faces --gzip for bounded static face clearance,
CPU-only seated targets, separate long-bottom LOD streams and deterministic
lossless compression. The independent release gate poses the final bytes again;
--fit-rest remains a diagnostic vertex-only fit.
"""
from __future__ import annotations
import os
for _name in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS'):
    os.environ.setdefault(_name,'1')
import argparse, ast, copy, gzip, hashlib, json, math, struct, subprocess, sys
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull
from PIL import Image, ImageDraw
from people_wear_shapes import Mesh, Patterns
from people_wear_lod import reduce_garment_far
from people_wear_pack import compact_body_streams

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
OUT=ROOT/'assets/models/wear'
SOURCE=ROOT/'assets/models/people/people.glb'


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def canon(name):return name.rsplit('_',1)[0] if name.rsplit('_',1)[-1].isdigit() else name


def source_inputs():
    paths = [
        'assets/models/people/people.glb', 'assets/models/people/people_lod.glb',
        'assets/models/people/people_meta.json', 'assets/models/people/people_albedo.jpg',
        'assets/models/people/people_normal.jpg', 'assets/models/people/people_orm.jpg',
        'tools/blender/people_body.py', 'tools/blender/people_body_limbs.py',
        'tools/blender/people_tex.py', 'tools/blender/people_head.py',
        'tools/blender/people_build.py', 'tools/blender/people_cast.py',
        'assets/models/manifest.people.json', 'assets/models/manifest.json',
    ]
    result = []
    for path in sorted(paths):
        data = (ROOT/path).read_bytes(); text = Path(path).suffix in ('.py', '.json')
        if text:data = data.replace(b'\r\n', b'\n')
        result.append({'path':path, 'form':'LF' if text else 'bytes',
                       'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest()})
    return result


def compressed_glb(data):
    # Deterministic lossless compression changes transport only. Independent
    # validators still decode and measure the original geometry and GPU bytes.
    import zopfli.gzip
    return zopfli.gzip.compress(data, numiterations=15)


def body_provenance_reference(ident, provenance):
    """Keep the full native-component audit in dev, with an exact LF byte pin.

    Components are authoring evidence, not runtime input. The shipped metadata
    retains the adapter, source hashes and coverage description; its full report
    is also bound into the independent clearance certificate input snapshot.
    """
    if 'components' not in provenance:return provenance
    relative='dev/wear/body-provenance/'+ident+'.json'
    path=ROOT/relative;path.parent.mkdir(parents=True,exist_ok=True)
    data=(json.dumps(provenance,indent=2)+'\n').encode('utf-8');path.write_bytes(data)
    summary={key:value for key,value in provenance.items() if key!='components'}
    summary['componentsReport']={'path':relative,'form':'LF','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    return summary


def lod_provenance_reference(ident, fit):
    """Hoist only the new endpoint-reduction maps, retaining exact measured LODs.

    This changes JSON placement, never geometry or the garment measurements.
    Existing reports are verified on repeat refreshes instead of being silently
    replaced. Every full map remains an LF-pinned clearance-certificate input.
    """
    garments=fit.get('garments',{})
    if not garments:raise RuntimeError(ident+': no garments for LOD provenance')
    maps={gid:copy.deepcopy(gar['lodReduction']) for gid,gar in garments.items() if 'lodReduction' in gar}
    relative='dev/wear/lod-provenance/'+ident+'.json'
    path=ROOT/relative
    if maps:
        if set(maps)!=set(garments):raise RuntimeError(ident+': incomplete inline LOD provenance')
        report={'schema':1,'id':ident,'garments':maps}
    else:
        pin=fit.get('lodReductionReport',{})
        if pin.get('path')!=relative or pin.get('form')!='LF':raise RuntimeError(ident+': missing LOD provenance pin')
        data=path.read_bytes().replace(b'\r\n',b'\n')
        if pin.get('bytes')!=len(data) or pin.get('sha256')!=hashlib.sha256(data).hexdigest():
            raise RuntimeError(ident+': LOD provenance bytes changed')
        report=json.loads(data)
    if report.get('schema')!=1 or report.get('id')!=ident or set(report.get('garments',{}))!=set(garments):
        raise RuntimeError(ident+': LOD provenance identity or garment inventory changed')
    for gid,gar in garments.items():
        row=report['garments'][gid]
        if row.get('triangles')!=gar['farTris'] or row.get('targetTriangles')!=min(600,(2*gar['tris'])//5):
            raise RuntimeError(ident+'/'+gid+': LOD provenance differs from measured triangles')
    if maps:
        data=(json.dumps(report,indent=2)+'\n').encode('utf-8')
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        fit['lodReductionReport']={'path':relative,'form':'LF','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        for gar in garments.values():del gar['lodReduction']
    return fit['lodReductionReport']


def read_glb(path):
    data=Path(path).read_bytes()
    if data[:2]==b'\x1f\x8b':data=gzip.decompress(data)
    if len(data)<28 or struct.unpack_from('<I',data,0)[0]!=0x46546c67:raise ValueError('Invalid GLB: '+str(path))
    length=struct.unpack_from('<I',data,12)[0]
    return json.loads(data[20:20+length]),data[28+length:]


def refresh_metadata(compress=False):
    """Refresh measured inventory after the separate explicit authoring fitter.

    This does not mark collisions as passing. The independent validator always
    poses current bytes again; no cached report can bless a changed garment.
    """
    path=OUT/'metadata.json';result=json.loads(path.read_text())
    for ident,fit in result['fits'].items():
        if fit.get('bodySourceProvenance'):
            fit['bodySourceProvenance']=body_provenance_reference(ident,fit['bodySourceProvenance'])
        file=ROOT/'assets/models'/fit['file']
        if compress and file.suffix=='.glb':
            dest=Path(str(file)+'.gz');dest.write_bytes(compressed_glb(file.read_bytes()))
            file.unlink();file=dest;fit['file']+='.gz'
        if compress and file.name.endswith('.glb.gz'):
            # A resumed fit can already reference its compressed output while a
            # previous raw generation remains beside it. Retire only that
            # unreferenced, task-owned peer, including on repeated --gzip runs.
            raw_peer=file.with_suffix('')
            if raw_peer.parent.resolve()!=OUT.resolve():raise ValueError('Raw cleanup escaped the owned wear directory')
            referenced=any(ROOT/'assets/models'/row['file']==raw_peer for row in result['fits'].values())
            if not referenced and raw_peer.exists():raw_peer.unlink()
        g,_=read_glb(file)
        used=set()
        for mesh in g['meshes']:
            for prim in mesh['primitives']:
                used.update(prim['attributes'].values());used.add(prim['indices'])
        for n in g['nodes']:
            ai=n.get('extras',{}).get('sourceIndicesAccessor')
            if ai is not None:used.add(ai)
        views={g['accessors'][i]['bufferView'] for i in used}
        fit['gpuGeometryBytes']=sum(g['bufferViews'][i]['byteLength'] for i in views)
        fit['bytes']=file.stat().st_size;fit['sha256']=sha(file)
        byname={n.get('name'):n for n in g['nodes']}
        for gid,gar in fit['garments'].items():
            for field,outfield in (('node','tris'),('lodNode','farTris')):
                prim=g['meshes'][byname[gar[field]]['mesh']]['primitives'][0]
                gar[outfield]=g['accessors'][prim['indices']]['count']//3
                gar['vertices' if field=='node' else 'farVertices']=g['accessors'][prim['attributes']['POSITION']]['count']
        lod_provenance_reference(ident,fit)
    result['gpuGeometryBytes']=sum(f['gpuGeometryBytes'] for f in result['fits'].values())
    result['gpuGrowthBytes']=result['gpuGeometryBytes']+result['atlas']['gpuBytes']
    model_files=[ROOT/'assets/models'/f['file'] for f in result['fits'].values()]
    if compress and sum(p.stat().st_size for p in model_files)>6000000:
        raise RuntimeError('Wear compressed model payload exceeds 6,000,000 bytes')
    result['files']=[{'file':'wear/'+p.name,'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(model_files)]+[{'file':'wear/wear_atlas.png','bytes':(OUT/'wear_atlas.png').stat().st_size,'sha256':sha(OUT/'wear_atlas.png')}]
    path.write_text(json.dumps(result,separators=(',',':'))+'\n')
    print(f"wear inventory: {len(result['fits'])} adults, {result['gpuGrowthBytes']} measured GPU bytes",flush=True)
    if result['gpuGrowthBytes']>=12000000:raise RuntimeError('Wear GPU growth is not below 12 MB')


def fit_rest(only=None, faces=False, author_jobs=4, resume_author=None):
    """Author isolated adult fits, retaining content-verified retry checkpoints.

    Low-priority workers share no mutable asset. Every requested fit must pass
    before final packing/publication; a failed fit cannot erase a successful
    solver result or accept a checkpoint from different numerical inputs.
    """
    # Upgrade existing raw metadata before taking authoring fingerprints. This
    # moves only new provenance maps; raw GLBs and every numerical field stay
    # byte-identical, and content-verified author checkpoints see the new pins.
    metadata_path=OUT/'metadata.json';raw_metadata=json.loads(metadata_path.read_text())
    if any('lodReduction' in gar for fit in raw_metadata['fits'].values() for gar in fit['garments'].values()):
        for ident,fit in raw_metadata['fits'].items():lod_provenance_reference(ident,fit)
        metadata_path.write_text(json.dumps(raw_metadata,separators=(',',':'))+'\n')
    program=r'''

import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {parseGlb} from './la-ladera/tools/blender/people_validate.mjs';
import {pushOutFit} from './la-ladera/tools/blender/people_wear_validate.mjs';
import {fitWearFaces,IDLE_FACE_GARMENTS} from './la-ladera/tools/blender/people_wear_fit_faces.mjs';
import {fitWearPoseTargets} from './la-ladera/tools/blender/people_wear_fit_targets.mjs';
const [only,faces,stage]=[JSON.parse(process.argv[1]),JSON.parse(process.argv[2]),process.argv[3]];
const metaPath='./la-ladera/assets/models/wear/metadata.json',metaBytes=readFileSync(metaPath),meta=JSON.parse(metaBytes),pending=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const compact=(value,key='')=>Array.isArray(value)?(['passes','history','iterations'].includes(key)?value.length:value.map(v=>compact(v))):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,compact(v,k)])):value;
if(only)for(const id of only)if(!meta.fits[id])throw Error('Unknown adult fit '+id);
if(faces)for(const[id,fit]of Object.entries(meta.fits)){
 if(only&&!only.includes(id))continue;
 if(fit.restFit||fit.faceFit||fit.poseFit)throw Error(id+': --fit-faces requires a fresh generated raw asset; the static 80 mm origin cannot reset');
}
mkdirSync(stage,{recursive:true});
const dependencyPaths=['tools/blender/people_validate.mjs','tools/blender/people_wear_validate.mjs','tools/blender/people_wear_fit_faces.mjs','tools/blender/people_wear_fit_targets.mjs','tools/blender/people_wear_fit_search.mjs','tools/blender/people_wear_math.mjs','js/people/wear_geometry.js','js/people/wear_pose.js','tools/blender/people_clips.json.gz','tools/blender/people_contract.json'];
dependencyPaths.push('tools/blender/people_wear_target_search.mjs','tools/blender/people_wear_pack.py','tools/blender/people_wear_layout.py');
dependencyPaths.push('vendor/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js','vendor/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm');
dependencyPaths.push('tools/blender/people_wear_build.py','tools/blender/people_wear_shapes.py','tools/blender/people_wear_body.py','tools/blender/people_wear_body_guard.py','tools/blender/people_wear_lod.py','tools/blender/people_body.py','tools/blender/people_body_limbs.py','tools/blender/people_build.py','tools/blender/people_cast.py','tools/blender/people_head.py','tools/blender/people_tex.py');
const dependencies=Object.fromEntries(dependencyPaths.map(path=>[path,sha(readFileSync('./la-ladera/'+path))]));
let currentId=null;

function writeFloat32(name,values){
 if(!(values instanceof Float32Array)||values.length%3||!values.every(Number.isFinite))throw Error(name+': invalid Float32 VEC3 author stream');
 const bytes=Buffer.alloc(values.length*4);for(let i=0;i<values.length;i++)bytes.writeFloatLE(values[i],i*4);
 writeFileSync(join(stage,name),bytes);return name;
}
try {
for(const[id,fit]of Object.entries(meta.fits)){
 if(only&&!only.includes(id))continue;
 currentId=id;
 const path=resolve('./la-ladera/assets/models',fit.file),input=readFileSync(path),compressed=input[0]===31&&input[1]===139;
 const rawBytes=compressed?gunzipSync(input):input;
 const authorKey=sha(Buffer.from(JSON.stringify({schema:1,id,faces,inputSha256:sha(input),fit,dependencies})));
 const checkpointPath=join(stage,'author.json');
 if(existsSync(checkpointPath)){
  const previous=JSON.parse(readFileSync(checkpointPath)),entry=previous.pending?.find(row=>row.id===id);
  if(entry?.authorKey===authorKey&&Object.entries(entry.outputHashes??{}).length>0&&Object.entries(entry.outputHashes).every(([file,digest])=>existsSync(join(stage,file))&&sha(readFileSync(join(stage,file)))===digest)){
   meta.fits[id]=previous.metadata.fits[id];pending.push({...entry,inputPath:path});continue;
  }
 }
 writeFileSync(join(stage,'input.json'),JSON.stringify({id,path,inputSha256:sha(input),rawSha256:sha(rawBytes),fit,dependencies,authorKey},null,2)+'\n');
 const reportFiles=[];
 const recordReport=(phase,report)=>{
  const file=id+'.'+phase+'.json',destination='dev/wear/authoring/'+id+'/'+phase+'.json';
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');writeFileSync(join(stage,file),bytes);
  const reference={path:destination,form:'LF',bytes:bytes.length,sha256:sha(bytes)};
  reportFiles.push({phase,file,destination,...reference});return reference;
 };
 const result=await pushOutFit(parseGlb(rawBytes),fit,{id,samples:[{clip:null,clipName:'rest',time:0}],passes:8,padding:.0015,maxMove:.08});
 if(!result.report.converged)throw Error(id+': rest fit did not converge');
 let output=result.bytes;writeFileSync(join(stage,id+'.rest.glb'),output);
 fit.restFit={samples:1,passes:result.report.passes.length,movedVertices:result.report.movedVertices,maxDisplacementM:result.report.maxDisplacement,boundedSearches:result.report.boundedSearches,unresolved:0,report:recordReport('rest',result.report)};
 fit.gpuGeometryBytes=result.report.gpuGeometryBytes;
 const targetFiles=[];
 if(faces){
  const fitted=await fitWearFaces(parseGlb(rawBytes),parseGlb(result.bytes),fit,{id,garmentIds:IDLE_FACE_GARMENTS});
  if(!fitted.report.converged||!fitted.report.rawRestClear||fitted.report.faceFailures)throw Error(id+': expanded idle face fit did not converge');
  const {pools,...faceSummary}=compact(fitted.report);
  output=fitted.bytes;fit.faceFit={...faceSummary,poolCount:pools.length,report:recordReport('faces',fitted.report)};fit.gpuGeometryBytes=fitted.report.gpuGeometryBytes;
  writeFileSync(join(stage,id+'.idle.glb'),output);
  const posed=await fitWearPoseTargets(parseGlb(rawBytes),parseGlb(output),fit,{id});
  if(!posed.report.converged)throw Error(id+': seated target authoring did not converge');
  const {staticRows,targets,...poseSummary}=compact(posed.report);
  fit.poseFit={...poseSummary,staticRowCount:staticRows.length,targetCount:targets.length,report:recordReport('seated',posed.report)};
  for(const row of posed.targets){
   if(!['trousers','leggings'].includes(row.garment)||![0,1].includes(row.lod))throw Error(id+': unsupported target cut or LOD');
   const stem=id+'.'+row.garment+'.lod'+row.lod;
   targetFiles.push({garment:row.garment,lod:row.lod,positions:writeFloat32(stem+'.positions.f32',row.bindPositions),
     ...(row.baseOverride?{baseOverride:writeFloat32(stem+'.base.f32',row.baseOverride)}:{})});
  }
  const keys=new Set(targetFiles.map(row=>row.garment+'/'+row.lod));
  for(const key of ['trousers/1','leggings/0','leggings/1'])if(!keys.has(key))throw Error(id+': missing required target '+key);
  if(!fit.topologyChoices?.trousers&&!keys.has('trousers/0'))throw Error(id+': missing required detailed near target');
 }
 const stagedBase=id+'.idle.glb';writeFileSync(join(stage,stagedBase),output);
 const files=[stagedBase,...targetFiles.flatMap(row=>[row.positions,...(row.baseOverride?[row.baseOverride]:[])]),...reportFiles.map(row=>row.file)];
 const outputHashes=Object.fromEntries(files.map(file=>[file,sha(readFileSync(join(stage,file)))]));
 pending.push({id,inputPath:path,inputSha256:sha(input),compressed,stagedBase,targets:targetFiles,reports:reportFiles,authorKey,outputHashes});

}
if(dependencyPaths.some(path=>sha(readFileSync('./la-ladera/'+path))!==dependencies[path]))throw Error('Numerical authoring source changed during this fit; checkpoint not published');
writeFileSync(join(stage,'author.json'),JSON.stringify({metadata:meta,metadataSha256:sha(metaBytes),pending},null,2)+'\n');
} catch(error) {
 writeFileSync(join(stage,'error.json'),JSON.stringify({id:currentId,error:error.message,stack:error.stack,report:error.report??null},null,2)+'\n');
 process.stderr.write((currentId??'wear author')+': '+error.message+'\n');process.exitCode=1;
}

'''
    import tempfile
    from concurrent.futures import ThreadPoolExecutor, as_completed
    if author_jobs<1 or author_jobs>8:raise ValueError('Author jobs must be between one and eight')
    (ROOT/'.scratch').mkdir(exist_ok=True)
    stage = Path(resume_author).resolve() if resume_author else Path(tempfile.mkdtemp(prefix='wear-author-',dir=ROOT/'.scratch'))
    stage.mkdir(parents=True,exist_ok=True)
    meta_path = OUT/'metadata.json';input_metadata_sha = sha(meta_path)
    meta = json.loads(meta_path.read_text());ids = list(meta['fits']) if only is None else list(only)
    if len(set(ids))!=len(ids) or any(ident not in meta['fits'] for ident in ids):raise ValueError('Unknown or duplicate adult authoring fit')
    print(f'wear author checkpoints: {stage}; {len(ids)} fits, {author_jobs} idle workers',flush=True)
    completed = [];failures = []
    def run_fit(ident):
        directory = stage/ident;directory.mkdir(parents=True,exist_ok=True)
        with (directory/'worker.log').open('w') as log:
            result = subprocess.run(['node','--import','./la-ladera/tests/nice.mjs','--input-type=module','-e',program,
                                     json.dumps([ident]),json.dumps(faces),str(directory)],cwd=ROOT.parent,stdout=log,stderr=subprocess.STDOUT)
        if result.returncode:
            path = directory/'error.json'
            error = json.loads(path.read_text()).get('error') if path.exists() else 'Author worker failed; see worker.log'
            return ident,None,error
        result = json.loads((directory/'author.json').read_text())
        entry = next(row for row in result['pending'] if row['id']==ident)
        return ident,(directory,result['metadata']['fits'][ident],entry),None
    with ThreadPoolExecutor(max_workers=author_jobs) as executor:
        futures = [executor.submit(run_fit,ident) for ident in ids]
        for future in as_completed(futures):
            ident,result,error = future.result()
            if error:failures.append({'id':ident,'error':error})
            else:completed.append((ident,*result))
            status = 'FAILED: '+error if error else 'complete'
            print(f'wear author {len(completed)}/{len(ids)} complete, {len(failures)} failed: {ident} {status}',flush=True)
            (stage/'run-summary.json').write_text(json.dumps({'requested':ids,'completed':[row[0] for row in completed],'failures':failures},indent=2)+'\n')
    if failures:
        raise RuntimeError(f'{len(failures)} adult fits failed; no fitted assets published. Fix the listed inputs, then retry --resume-author {stage}')
    pending = [];pending_reports=[]
    for ident,directory,fit,entry in completed:
        # Verify every checkpoint output again before consuming it for final
        # packing, including target streams as well as the full proof reports.
        # The worker's retry guard alone cannot cover a subsequent file change.
        for filename,digest in entry['outputHashes'].items():
            if Path(filename).name!=filename or sha(directory/filename)!=digest:
                raise RuntimeError(ident+': authored checkpoint output changed before packing: '+filename)
        base = directory/entry['stagedBase']
        reports=entry.get('reports',[])
        expected_reports={'rest','faces','seated'} if faces else {'rest'}
        if {row['phase'] for row in reports}!=expected_reports or len(reports)!=len(expected_reports):
            raise RuntimeError(ident+': missing or duplicated authoring proof report')
        for row in reports:
            expected='dev/wear/authoring/'+ident+'/'+row['phase']+'.json'
            if row['destination']!=expected or row['path']!=expected or row['file']!=ident+'.'+row['phase']+'.json' or row['form']!='LF':
                raise RuntimeError(ident+': invalid authoring report path or form')
            data=(directory/row['file']).read_bytes()
            if len(data)!=row['bytes'] or hashlib.sha256(data).hexdigest()!=row['sha256'] or row['sha256']!=entry['outputHashes'][row['file']]:
                raise RuntimeError(ident+': authoring proof report changed before publication')
            pending_reports.append((ROOT/expected,data))
        if faces:
            targets = {};overrides = {}
            for row in entry['targets']:
                key = (row['garment'],row['lod'])
                if key in targets:raise ValueError(ident+': duplicate authored target')
                targets[key] = np.fromfile(directory/row['positions'],dtype='<f4').reshape(-1,3)
                if row.get('baseOverride'):
                    overrides[key] = np.fromfile(directory/row['baseOverride'],dtype='<f4').reshape(-1,3)
            output = directory/(ident+'.packed.glb')
            report = repack_wear_lods(base,output,fit,targets,overrides)
            fit['gpuGeometryBytes'] = report['gpuGeometryBytes'];fit['poseTargetCpuBytes'] = report['poseTargetCpuBytes']
            if report.get('bodyPacking'):fit['bodyPacking']=report['bodyPacking']
            if report['topologyChoices']:fit['topologyChoices'] = report['topologyChoices']
            for row in report['mappings'].values():
                garment = fit['garments'][row['garment']]
                garment['vertices' if row['lod']==0 else 'farVertices'] = row['vertices']
                garment['tris' if row['lod']==0 else 'farTris'] = row['triangles']
            fit['poseFit']['encoding'] = {'sourceBaseSha256':report['sourceBaseSha256'],
                'cpuBytes':report['poseTargetCpuBytes'],'accessors':report['poseTargetAccessors'],
                'maximumDeltaM':max(row['maximumDeltaM'] for row in report['targets'].values()),
                'maximumRoundTripErrorM':max(row['roundTripErrorM'] for row in report['targets'].values())}
            (directory/'packing.json').write_text(json.dumps(report,indent=2)+'\n')
        else:output = base
        data = output.read_bytes()
        if entry['compressed']:data = compressed_glb(data)
        destination = Path(entry['inputPath']);pending.append((destination,data,entry['inputSha256']))
        fit['bytes'] = len(data);fit['sha256'] = hashlib.sha256(data).hexdigest();meta['fits'][ident] = fit
    meta['gpuGeometryBytes'] = sum(f['gpuGeometryBytes'] for f in meta['fits'].values())
    meta['gpuGrowthBytes'] = meta['gpuGeometryBytes']+meta['atlas']['gpuBytes']
    if meta['gpuGrowthBytes']>=12000000:raise RuntimeError('Wear GPU growth is not below 12 MB after complete authoring')
    if sha(meta_path)!=input_metadata_sha:raise RuntimeError('Wear metadata changed during authoring; checkpoints are retained for a content-verified retry')
    for destination,data,expected in pending:
        if sha(destination)!=expected:raise RuntimeError(str(destination)+': raw input changed during authoring')
    for destination,data in pending_reports:
        destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
    for destination,data,_ in pending:destination.write_bytes(data)
    meta_path.write_text(json.dumps(meta,separators=(',',':'))+'\n')
    refresh_metadata()


def source_recipes():
    """Read the source recipe definitions without importing its write side effects."""
    tree=ast.parse((HERE/'people_build.py').read_text())
    names={'PEOPLE','BONES','ALLOWED'}
    funcs={'proportions','torso_ctrl','bone_defs','weights_for','seg_dist','clamp01'}
    nodes=[n for n in tree.body if (isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets)) or (isinstance(n,ast.FunctionDef) and n.name in funcs)]
    env={'math':math};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(HERE/'people_build.py'),'exec'),env)
    from people_cast import customize_cast
    env['PEOPLE']=customize_cast(copy.deepcopy(env['PEOPLE']))
    return env


def decode_source(ids):
    # Use the existing, vendored Draco decoder and accessor reader. Nothing is
    # re-encoded or downloaded, and original joint-order/index mappings survive.
    program=r'''
import { readGlb, decodePrimitive, readAccessor } from './la-ladera/tools/blender/people_validate.mjs';
const doc=readGlb('./la-ladera/assets/models/people/people.glb'), ids=JSON.parse(process.argv[1]);
const out={g:doc.g,fits:{}};
for(const id of ids){
 const ni=doc.g.nodes.findIndex(n=>n.name==='person_'+id+'_mesh'),n=doc.g.nodes[ni];
 const decoded=await decodePrimitive(doc,doc.g.meshes[n.mesh].primitives[0]);
 out.fits[id]={node:ni,skin:n.skin,attrs:Object.fromEntries(Object.entries(decoded.attrs).map(([k,v])=>[k,[...v]])),indices:[...decoded.indices],bind:[...readAccessor(doc,doc.g.skins[n.skin].inverseBindMatrices)]};
}
process.stdout.write(JSON.stringify(out));
'''
    result=subprocess.run(['node','--input-type=module','-e',program,json.dumps(ids)],cwd=ROOT.parent,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
    return json.loads(result.stdout)


def atlas(size):
    # Preserve the actual Part A motifs rather than approximating names with a
    # solid tint. Deterministic fine weave adds cloth grain to the larger page.
    source=ROOT/'assets/models/garments/prints.png'
    image=Image.open(source).convert('RGB').resize(tuple(size),Image.Resampling.NEAREST)
    arr=np.asarray(image).astype(np.float64);yy,xx=np.indices(arr.shape[:2])
    grain=1.+.018*np.sin(xx*math.pi/2)*np.cos(yy*math.pi/2)+.009*np.sin(xx*.79+yy*1.31)
    arr=np.uint8(np.clip(arr*grain[:,:,None],0,255));Image.fromarray(arr).save(OUT/'wear_atlas.png',optimize=True)


def to_gltf(points):
    p=np.asarray(points,dtype=np.float64)
    return np.column_stack((p[:,0],p[:,2],-p[:,1]))


def from_gltf(points):
    p=np.asarray(points,dtype=np.float64)
    return np.column_stack((p[:,0],-p[:,2],p[:,1]))


def identity_and_proxy(src,P,joints,skin):
    """Retain source identity triangles and supply a conservative closed head.

    The optional body has its own closed neck. Source head/hair is retained above
    the neck seam, without importing embedded coats, hats or accessories. The
    exact retained vertices are checked against the proxy by the independent
    validator after skinning, including their original blended neck weights.
    """
    a=src['attrs'];p=from_gltf(np.asarray(a['POSITION']).reshape(-1,3));w=np.asarray(a['WEIGHTS_0']).reshape(-1,4);jj=np.asarray(a['JOINTS_0'],dtype=int).reshape(-1,4)
    headj=joints.index('head');neckj=joints.index('neck')
    headweight=np.sum(w*((jj==headj)|(jj==neckj)),axis=1)
    tri=np.asarray(src['indices'],dtype=int).reshape(-1,3)
    # The source's one-material meshes encode skin, hair and cloth via UV cells.
    # Restrict head-only weighted triangles above the chin to leave hats optional.
    col=np.asarray(a['COLOR_0']).reshape(-1,4)
    slots=np.rint(col[:,3]*255/16).astype(int)
    allowed=(headweight>.72)&(p[:,2]>P['chin']-.010)&~np.isin(slots,[2,3,4,5,6,7])
    keep=tri[np.all(allowed[tri],axis=1)]
    if len(keep)<100:raise RuntimeError('Missing retained identity topology')
    ids=np.unique(keep);remap={int(v):i for i,v in enumerate(ids)}
    idm=Mesh(skin);idm.p=p[ids].tolist();idm.w=[[(joints[int(j)],float(ww)) for j,ww in zip(jj[v],w[v]) if ww>1e-7] for v in ids]
    idm.uv=np.asarray(a['TEXCOORD_0']).reshape(-1,2)[ids].tolist();idm.c=col[ids].tolist();idm.tri=[tuple(remap[int(v)] for v in f) for f in keep]
    idm.far=list(idm.tri)
    idm.source_normals=from_gltf(np.asarray(a['NORMAL']).reshape(-1,3)[ids])
    # Convex hull of the retained visible source head. The lower jaw retains its
    # original neck/head blend: rigidly weighting that hull to head alone leaves
    # the real jaw outside when a phone pose turns the head. The neck margin is
    # 21 mm, tapering to 14 mm above the lower face, without raising hat crowns.
    # These margins are proposals; every actual posed source vertex is checked.
    points=np.asarray(idm.p);center=(points.min(0)+points.max(0))/2
    v=points-center;lengths=np.linalg.norm(v,axis=1)
    lower=np.clip((P['chin']+.10-points[:,2])/.10,0,1)
    margins=.014+.007*lower
    expanded=center+v*(1.+margins/np.maximum(lengths,.015))[:,None]
    hull=ConvexHull(expanded)
    hv=np.unique(hull.simplices);mapping={int(x):i for i,x in enumerate(hv)}
    proxy=Mesh(skin);proxy.p=expanded[hv].tolist();proxy.w=[idm.w[int(i)] for i in hv];proxy.uv=[(.5,.5)]*len(hv);proxy.c=[(1,1,1,1)]*len(hv)
    for f,eq in zip(hull.simplices,hull.equations):
        aa,bb,cc=expanded[f];out=np.cross(bb-aa,cc-aa)
        if np.dot(out,eq[:3])<0:f=f[::-1]
        proxy.tri.append(tuple(mapping[int(i)] for i in f))
    proxy.far=list(proxy.tri);proxy.components=[dict(name='head',firstIndex=0,indexCount=len(proxy.tri)*3)]
    idm.source_indices=keep.reshape(-1).astype(int).tolist()
    return idm,proxy,(expanded.min(0),expanded.max(0))


class GLB:
    def __init__(self):
        self.g={'asset':{'version':'2.0','generator':'La Ladera people_wear_build.py; original generated patterns'},'extensionsUsed':['KHR_mesh_quantization'],'extensionsRequired':['KHR_mesh_quantization'],'scenes':[{'nodes':[0]}],'scene':0,'nodes':[{'name':'wear_library','children':[]}],'meshes':[],'skins':[],'materials':[],'bufferViews':[],'accessors':[],'buffers':[]}
        self.bin=bytearray();self.gpu=0;self.pool={};self.accessor_pool={}

    def accessor(self,arr,ctype,typ,normalized=False,target=None,bounds=False,dedup_group=None):
        arr=np.asarray(arr)
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[typ]
        stride=width*arr.dtype.itemsize
        if target==34962 and stride%4:
            # KHR_mesh_quantization retains glTF's four-byte vertex alignment.
            # In particular byte VEC3 normals need a fourth padding byte.
            packed=arr.reshape(-1,width).view(np.uint8).reshape(-1,stride)
            padded=np.zeros((len(packed),(stride+3)//4*4),dtype=np.uint8)
            padded[:,:stride]=packed;data=padded.tobytes();stride=padded.shape[1]
        else:data=arr.tobytes(order='C')
        key=(ctype,typ,normalized,target,bounds,dedup_group,hashlib.sha256(data).hexdigest())
        if key in self.accessor_pool:return self.accessor_pool[key]
        while len(self.bin)%4:self.bin.append(0)
        off=len(self.bin);self.bin.extend(data)
        view={'buffer':0,'byteOffset':off,'byteLength':len(data)}
        if target:view['target']=target
        if target==34962:view['byteStride']=stride
        vi=len(self.g['bufferViews']);self.g['bufferViews'].append(view)
        ac={'bufferView':vi,'componentType':ctype,'count':arr.size//width,'type':typ}
        if normalized:ac['normalized']=True
        if bounds:
            vv=arr.reshape(-1,width);ac['min']=vv.min(0).astype(float).tolist();ac['max']=vv.max(0).astype(float).tolist()
        ai=len(self.g['accessors']);self.g['accessors'].append(ac)
        if target:self.gpu+=len(data)
        self.accessor_pool[key]=ai
        return ai

    def skeleton(self,original,src):
        oldskin=original['skins'][src['skin']];oldnodes=original['nodes'];mapping={oi:i+1 for i,oi in enumerate(oldskin['joints'])}
        for oi in oldskin['joints']:
            n=copy.deepcopy(oldnodes[oi]);n['name']=canon(n['name']);n.pop('mesh',None);n.pop('skin',None)
            if 'children'in n:n['children']=[mapping[i] for i in n['children'] if i in mapping]
            self.g['nodes'].append(n)
        roots=[i for i in oldskin['joints'] if not any(i in oldnodes[p].get('children',[]) for p in oldskin['joints'])]
        self.g['nodes'][0]['children']=[mapping[i] for i in roots]
        ib=self.accessor(np.asarray(src['bind'],dtype='<f4'),5126,'MAT4')
        self.g['skins'].append({'name':'wear_skin','joints':[mapping[i] for i in oldskin['joints']],'inverseBindMatrices':ib})
        return [canon(oldnodes[i]['name']) for i in oldskin['joints']]

    def mesh(self,name,m,joints,material,*,far=False,attrs=None,visible=True,extras=None):
        if attrs is None:
            pp=to_gltf(m.p);nn=to_gltf(getattr(m,'source_normals',m.normals()))
            jw=[];ww=[]
            for weights in m.w:
                weights=sorted(weights,key=lambda x:-x[1])[:4];total=sum(w for _,w in weights)
                weights=[(joints.index(j),w/total) for j,w in weights]
                js=[j for j,w in weights]+[0]*(4-len(weights));ws=[w for j,w in weights]+[0]*(4-len(weights))
                q=[int(round(w*255)) for w in ws];q[0]+=255-sum(q)
                jw.append(js);ww.append(q)
            # Arrays are shared by near/far nodes. Full attribute sets belonging
            # to genuinely identical patterns are also deduplicated by payload.
            arrays=[np.asarray(pp,dtype='<f4'),np.asarray(np.clip(np.rint(nn*127),-127,127),dtype='i1'),np.asarray(np.rint(np.clip(m.uv,0,1)*255),dtype='u1'),np.asarray(np.rint(np.clip(np.asarray(m.c)[:,:3],0,1)*255),dtype='u1'),np.asarray(jw,dtype='u1'),np.asarray(ww,dtype='u1')]
            # Weld only vertices whose final uploaded attributes are identical.
            # Colour is intentionally absent; stale authoring fold shades must
            # not prevent two otherwise identical near/far seam copies sharing.
            used=sorted({v for f in m.tri+m.far for v in f});vertex_map={};rows=[];remap={}
            for vi in used:
                key=b''.join(arrays[j][vi].tobytes() for j in (0,1,2,4,5))
                if key not in vertex_map:vertex_map[key]=len(rows);rows.append(vi)
                remap[vi]=vertex_map[key]
            arrays=[a[rows] for a in arrays]
            m._packed_tri=[tuple(remap[v] for v in f) for f in m.tri]
            m._packed_far=[tuple(remap[v] for v in f) for f in m.far]
            key=hashlib.sha256(b''.join(arrays[j].tobytes() for j in (0,1,2,4,5))).hexdigest()
            if key in self.pool:attrs=self.pool[key]
            else:
                spec=[('POSITION',5126,'VEC3',False),('NORMAL',5120,'VEC3',True),('TEXCOORD_0',5121,'VEC2',True),('COLOR_0',5121,'VEC3',True),('JOINTS_0',5121,'VEC4',False),('WEIGHTS_0',5121,'VEC4',True)]
                # PBR lighting and the shared full-colour cloth atlas supply the
                # colour. Uniform optional vertex tint arrays would cost four
                # padded GPU bytes per vertex across 529 fitted garments.
                attrs={n:self.accessor(a,c,t,norm,34962,n=='POSITION') for a,(n,c,t,norm) in zip(arrays,spec) if n!='COLOR_0'};self.pool[key]=attrs
        triangles=m._packed_far if far else m._packed_tri
        idx=self.accessor(np.asarray(triangles,dtype='<u2'),5123,'SCALAR',target=34963)
        mi=len(self.g['meshes']);self.g['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':idx,'mode':4,'material':material}]})
        ni=len(self.g['nodes']);node={'name':name,'mesh':mi,'skin':0}
        node['extras']={'wearVisible':visible,**(extras or {})}
        self.g['nodes'].append(node);self.g['nodes'][0]['children'].append(ni)
        return attrs

    def save(self,path):
        while len(self.bin)%4:self.bin.append(0)
        self.g['buffers']=[{'byteLength':len(self.bin)}]
        data=json.dumps(self.g,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
        output=struct.pack('<III',0x46546c67,2,28+len(data)+len(self.bin))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(self.bin),0x004e4942)+self.bin
        path.write_bytes(output)


WEAR_TOPOLOGY_CHOICES = {
    # The fuller tailored hip's detailed near triangulation was rejected during
    # seated artwork review. Export its complete lower-detail cut at both LODs;
    # the full body and every exported garment triangle retain the same checks.
    'w_vecina': {
        garment: {'nearCut': 'complete-far-cut', 'sourceLod': 1,
                  'reason': 'Complete hip coverage uses the proven full lower-detail cut.'}
        for garment in ('trousers', 'jeans')
    },
    'w_peluquera': {
        garment: {'nearCut': 'complete-far-cut', 'sourceLod': 1,
                  'reason': 'The complete lower-detail hip cut retains seated coverage.'}
        for garment in ('trousers', 'jeans', 'leggings')
    },
    # These detailed sleeve cuffs retained a local forearm face intersection
    # under the unchanged static fit. Their complete lower-detail cuts keep
    # the sleeve coverage and are authored and tested as real near meshes.
    **{ident: {garment: {'nearCut': 'complete-far-cut', 'sourceLod': 1,
                         'application': 'raw-build',
                         'reason': 'The complete lower-detail sleeve cut preserves forearm coverage.'}
               for garment in garments}
       for ident, garments in [('w_tendera', ('shirt', 'jumper')),
                               ('w_ama', ('shirt', 'jumper')),
                               ('w_elder', ('shirt', 'jumper')),
                               ('w_afro', ('shirt', 'jumper')),
                               ('w_cocinera', ('shirt', 'jumper')),
                               ('w_farmaceutica', ('shirt',)),
                               ('w_maestra', ('jumper',)),
                               ('w_beata', ('shirt', 'jumper'))]},
}
for _ident, _garments in [('w_ama', ('trousers', 'jeans', 'leggings')),
                         ('w_tendera', ('trousers', 'jeans')),
                         ('w_beata', ('trousers', 'jeans')),
                         ('w_afro', ('trousers', 'jeans', 'leggings')),
                         ('w_elder', ('trousers', 'jeans')),
                         ('w_cocinera', ('trousers', 'jeans'))]:
    WEAR_TOPOLOGY_CHOICES.setdefault(_ident, {}).update({
        garment: {'nearCut': 'complete-far-cut', 'sourceLod': 1,
                  'reason': 'The complete lower-detail hip cut retains seated coverage.'}
        for garment in _garments})


POSE_TARGET_ACTIVATION = {
    'parentJoint': 'hips',
    'thighJoints': ['thigh_l', 'thigh_r'],
    'startRadians': math.pi / 4,
    'fullRadians': 4 * math.pi / 9,
}


def accessor_raw(g, binary, index):
    """Read encoded values without normalizing or requantizing vertex streams."""
    a = g['accessors'][index]
    if a.get('sparse'):
        raise ValueError('Sparse accessors are outside the generated wear contract')
    view = g['bufferViews'][a['bufferView']]
    dtype = np.dtype({5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2',
                      5125: '<u4', 5126: '<f4'}[a['componentType']])
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    stride = view.get('byteStride', width * dtype.itemsize)
    relative = a.get('byteOffset', 0)
    if relative + (a['count'] - 1) * stride + width * dtype.itemsize > view['byteLength']:
        raise ValueError('Accessor exceeds its buffer view')
    return np.ndarray((a['count'], width), dtype=dtype, buffer=binary,
                      offset=view.get('byteOffset', 0) + relative,
                      strides=(stride, dtype.itemsize)).copy()


def repack_wear_lods(source, destination, fit, pose_targets=None, base_overrides=None):
    """Losslessly separate the long cuts' LOD streams after static authoring.

    Targets are optional Float32 bind positions indexed like the immutable input
    pool, keyed by (garment, lod). They are never substituted for base POSITION.
    CPU-only deltas are gathered through the same remap as their rendered LOD.
    The final emitted target addition still requires independent pose validation.
    """
    source, destination = Path(source), Path(destination)
    old, binary = read_glb(source)
    if any(image.get('bufferView') is not None for image in old.get('images', [])):
        raise ValueError('Wear uses external shared atlases, not embedded images')
    if any(p.get('extensions', {}).get('KHR_draco_mesh_compression')
           for mesh in old.get('meshes', []) for p in mesh.get('primitives', [])):
        raise ValueError('Wear repacking expects the uncompressed generated vertex contract')
    if any(n.get('extras', {}).get('poseTarget') is not None for n in old['nodes']):
        raise ValueError('Pose targets must be exported from an immutable static base')
    targets = pose_targets or {}
    overrides = base_overrides or {}
    fit_id = fit['bodyNode'].removeprefix('wear_body_')
    # Original complete-cut recipes remain supported and fingerprint-checked
    # for legacy fixtures. New native-body exports retain independent near cuts
    # and reduce every far garment to at most 40 percent.
    choices = {} if fit.get('bodySourceProvenance', {}).get('adapter') == 'current-native-body' else copy.deepcopy(WEAR_TOPOLOGY_CHOICES.get(fit_id, {}))
    if fit.get('topologyChoices', choices) != choices:
        raise ValueError(fit_id + ': topology choices disagree with the source recipe')
    writer = GLB()
    writer.g = copy.deepcopy(old)
    writer.g['accessors'], writer.g['bufferViews'], writer.g['buffers'] = [], [], []
    node_indices = {n.get('name'): i for i, n in enumerate(old['nodes'])}
    body_meshes = [old['nodes'][node_indices[fit[key]]]['mesh'] for key in ('bodyNode','bodyLodNode')]
    body_primitives = [old['meshes'][index]['primitives'][0] for index in body_meshes]
    if body_primitives[0]['attributes'] != body_primitives[1]['attributes']:
        raise ValueError(fit_id+': body LODs must share the original encoded pool before packing')
    body_attributes = body_primitives[0]['attributes']
    body_packed = compact_body_streams(
        {name:accessor_raw(old,binary,index) for name,index in body_attributes.items()},
        *(accessor_raw(old,binary,p['indices']) for p in body_primitives))
    body_output_attributes = None
    selected = {}
    for garment in ('trousers', 'jeans', 'leggings'):
        for lod, field in ((0, 'node'), (1, 'lodNode')):
            name = fit['garments'][garment][field]
            ni = node_indices[name]
            mi = old['nodes'][ni]['mesh']
            if mi in selected:
                raise ValueError('Generated garment nodes must own their mesh definitions')
            selected[mi] = (ni, garment, lod, name)
    cache = {}

    def copy_accessor(index, target=None):
        key = (index, target)
        if key not in cache:
            a = old['accessors'][index]
            cache[key] = writer.accessor(accessor_raw(old, binary, index),
                a['componentType'], a['type'], a.get('normalized', False),
                target=target, bounds='min' in a and 'max' in a)
        return cache[key]

    mappings = {}
    target_accessors = set()
    target_metrics = {}
    for mi, old_mesh in enumerate(old['meshes']):
        if len(old_mesh['primitives']) != 1:
            raise ValueError('Generated wear meshes require one primitive')
        op = old_mesh['primitives'][0]
        p = writer.g['meshes'][mi]['primitives'][0]
        if mi in body_meshes:
            if body_output_attributes is None:
                body_output_attributes = {}
                for attribute,ai in body_attributes.items():
                    a=old['accessors'][ai]
                    body_output_attributes[attribute]=writer.accessor(
                        body_packed['encoded'][attribute],a['componentType'],a['type'],
                        a.get('normalized',False),target=34962,bounds='min' in a and 'max' in a)
            p['attributes']=body_output_attributes.copy()
            indices=body_packed['near_indices' if mi==body_meshes[0] else 'far_indices']
            p['indices']=writer.accessor(indices,5123,'SCALAR',target=34963)
            continue
        if mi not in selected:
            p['attributes'] = {name: copy_accessor(ai, 34962)
                               for name, ai in op['attributes'].items()}
            p['indices'] = copy_accessor(op['indices'], 34963)
            continue
        ni, garment, lod, name = selected[mi]
        cut = 'trousers' if garment == 'jeans' else garment
        source_lod = lod
        choice = choices.get(garment) if lod == 0 else None
        if choice is not None:
            if choice['nearCut'] != 'complete-far-cut' or choice['sourceLod'] != 1:
                raise ValueError(name + ': unsupported source topology choice')
            source_lod = 1
            source_node = old['nodes'][node_indices[fit['garments'][garment]['lodNode']]]
            op = old['meshes'][source_node['mesh']]['primitives'][0]
            writer.g['nodes'][ni].setdefault('extras', {})['topologyChoice'] = copy.deepcopy(choice)
        original_count = old['accessors'][op['attributes']['POSITION']]['count']
        encoded = {attribute: accessor_raw(old, binary, ai)
                   for attribute, ai in op['attributes'].items()}
        indices = accessor_raw(old, binary, op['indices']).reshape(-1).astype(np.int64)
        count = len(encoded['POSITION'])
        if len(indices) % 3 or len(indices) // 3 > (1800 if lod == 0 else 600):
            raise ValueError(name + ': triangle count exceeds the existing LOD budget')
        used = np.unique(indices)
        remap = np.full(count, -1, dtype=np.int64)
        remap[used] = np.arange(len(used))
        original_base = encoded['POSITION'].astype('<f4')
        override = overrides.get((cut, source_lod))
        override_normals = None
        if override is not None:
            override = np.asarray(override, dtype='<f4').reshape(-1, 3)
            if override.shape != original_base.shape or not np.all(np.isfinite(override)):
                raise ValueError(name + ': invalid static base override')
            change = np.linalg.norm(override[used].astype(np.float64) - original_base[used], axis=1)
            if float(np.max(change)) > .010:
                raise ValueError(name + ': bounded base-margin step exceeds 10 mm')
            faces = indices.reshape(-1, 3)
            face_normals = np.cross(override[faces[:, 1]].astype(np.float64) - override[faces[:, 0]], override[faces[:, 2]].astype(np.float64) - override[faces[:, 0]])
            normals = np.zeros_like(override, dtype=np.float64)
            for corner in range(3): np.add.at(normals, faces[:, corner], face_normals)
            lengths = np.linalg.norm(normals, axis=1)
            fallback = encoded['NORMAL'].astype(np.float64) / 127
            normals[lengths < 1e-12] = fallback[lengths < 1e-12]
            normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-12)
            override_normals = np.rint(normals * 127).clip(-127, 127).astype('i1')
        p['attributes'] = {}
        for attribute, ai in op['attributes'].items():
            a = old['accessors'][ai]
            values = override if attribute == 'POSITION' and override is not None else override_normals if attribute == 'NORMAL' and override_normals is not None else encoded[attribute]
            p['attributes'][attribute] = writer.accessor(
                values[used], a['componentType'], a['type'],
                a.get('normalized', False), target=34962,
                bounds='min' in a and 'max' in a,
                dedup_group=(cut, lod) if attribute in ('POSITION', 'NORMAL') else None)
        packed_indices = remap[indices].astype('<u2')
        if len(used) > 65535:
            raise ValueError('Wear LOD exceeds the uint16 index contract')
        p['indices'] = writer.accessor(packed_indices, 5123, 'SCALAR', target=34963)
        mappings[name] = {'garment': garment, 'lod': lod,
            'oldPositionAccessor': op['attributes']['POSITION'],
            'oldVertexIds': used.tolist(), 'vertices': len(used),
            'sourceVertexIds': used.tolist(), 'originalSourceVertices': original_count,
            'triangles': len(indices) // 3,
            'sourceLod': source_lod, 'topologyChoice': copy.deepcopy(choice),
            'newPositionAccessor': p['attributes']['POSITION'],
            'baseMarginApplied': override is not None,
            'maximumBaseChangeM': float(np.max(change)) if override is not None else 0.}
        target = targets.get((cut, source_lod))
        if target is not None:
            base = override if override is not None else original_base
            target = np.asarray(target, dtype='<f4').reshape(-1, 3)
            if target.shape != base.shape or not np.all(np.isfinite(target)):
                raise ValueError(name + ': invalid CPU target shape or value')
            delta = (target[used].astype(np.float64) - base[used]).astype('<f4')
            max_delta = float(np.max(np.linalg.norm(delta.astype(np.float64), axis=1)))
            if max_delta > .18:
                raise ValueError(name + ': CPU target exceeds the total 180 mm bind limit')
            reconstructed = (base[used].astype(np.float64) + delta).astype('<f4')
            target_metrics[name] = {'maximumDeltaM': max_delta,
                'roundTripErrorM': float(np.max(np.linalg.norm(reconstructed.astype(np.float64) - target[used], axis=1)))}
            # No buffer target/stride, primitive attribute or morph target: this
            # accessor is read only by the wardrobe's CPU correction wrapper.
            delta_accessor = writer.accessor(delta, 5126, 'VEC3')
            target_accessors.add(delta_accessor)
            writer.g['nodes'][ni].setdefault('extras', {})['poseTarget'] = {
                'version': 1, 'kind': 'seated', 'deltaAccessor': delta_accessor,
                'basePositionAccessor': p['attributes']['POSITION'],
                'activation': copy.deepcopy(POSE_TARGET_ACTIVATION),
            }
    for si, skin in enumerate(old.get('skins', [])):
        writer.g['skins'][si]['inverseBindMatrices'] = copy_accessor(skin['inverseBindMatrices'])
    for ai, animation in enumerate(old.get('animations', [])):
        for si, sampler in enumerate(animation['samplers']):
            out = writer.g['animations'][ai]['samplers'][si]
            out['input'], out['output'] = copy_accessor(sampler['input']), copy_accessor(sampler['output'])
    for ni, node in enumerate(old['nodes']):
        identity = node.get('extras', {}).get('sourceIndicesAccessor')
        if identity is not None:
            writer.g['nodes'][ni]['extras']['sourceIndicesAccessor'] = copy_accessor(identity, 34963)
    destination.parent.mkdir(parents=True, exist_ok=True)
    writer.save(destination)
    from people_wear_layout import reorder_wear_buffer_views
    ordered, layout_metrics = reorder_wear_buffer_views(destination.read_bytes())
    destination.write_bytes(ordered)
    cpu_bytes = sum(writer.g['accessors'][ai]['count'] * 12 for ai in target_accessors)
    return {'sourceBaseSha256': sha(source), 'outputSha256': sha(destination),
            'gpuGeometryBytes': writer.gpu, 'poseTargetCpuBytes': cpu_bytes,
            'bodyPacking': body_packed['metrics'], 'bufferLayout': layout_metrics,
            'poseTargetAccessors': len(target_accessors), 'bytes': destination.stat().st_size,
            'topologyChoices': choices, 'mappings': mappings, 'targets': target_metrics}




def build_fit(pd,recipes,source,catalog):
    ident=pd['id'];src=source['fits'][ident];g=GLB();joints=g.skeleton(source['g'],src)
    P=recipes['proportions'](pd);bd=recipes['bone_defs'](P,pd,{})
    source_hips=source['g']['nodes'][source['g']['skins'][src['skin']]['joints'][joints.index('hips')]]
    bottom=P['hip']-.04-source_hips.get('translation',[0,0,0])[1]
    def skin(co,part):
        """Anatomical weights for the complete optional body and matching cloth.

        The old generic inverse-distance helper mixed chest into lower sleeves
        and pelvis into forearms when the relaxed hand touched the waist. Such
        mixed unrelated joints fold a cuff through the chest during prayer.
        Only anatomical neighbours blend here; source skeleton/clips stay exact.
        """
        z=co[2];side=part[-2:] if part.endswith(('_l','_r')) else ''
        clamp=lambda q:max(0.,min(1.,q))
        if side and part.startswith(('arm','farm')):
            sh=P['sh'];elbow=sh-.186*P['H'];wrist=elbow-.146*P['H'];k=P['k']
            if z>sh-.045*k:
                t=clamp((sh+.010*k-z)/(.055*k));return [('clavicle'+side,1-t),('upperarm'+side,t)]
            if z>elbow+.035*k:return [('upperarm'+side,1.)]
            if z>elbow-.035*k:
                t=clamp((elbow+.035*k-z)/(.070*k));return [('upperarm'+side,1-t),('forearm'+side,t)]
            if z>wrist+.025*k:return [('forearm'+side,1.)]
            t=clamp((wrist+.025*k-z)/(.050*k));return [('forearm'+side,1-t),('hand'+side,t)]
        if side and part.startswith(('thigh','shin')):
            hip,knee,ankle,k=P['hip'],P['knee'],P['ankle'],P['k']
            if z>hip-.055*k:
                t=clamp((hip+.015*k-z)/(.070*k));return [('hips',1-t),('thigh'+side,t)]
            if z>knee+.040*k:return [('thigh'+side,1.)]
            if z>knee-.040*k:
                t=clamp((knee+.040*k-z)/(.080*k));return [('thigh'+side,1-t),('shin'+side,t)]
            if z>ankle+.022*k:return [('shin'+side,1.)]
            t=clamp((ankle+.022*k-z)/(.044*k));return [('shin'+side,1-t),('foot'+side,t)]
        if side and part.startswith('foot'):return [('foot'+side,1.)]
        if part=='head':return [('head',1.)]
        if part=='torso' and P['hip']+.015*P['k']<=z<P['hip']+.11*P['k']:
            t=clamp((P['hip']+.11*P['k']-z)/(.095*P['k']))
            weights={bn:ww*(1-t) for bn,ww in recipes['weights_for'](co,part,bd)}
            weights['hips']=weights.get('hips',0.)+t
            return [(bn,ww) for bn,ww in weights.items() if ww>1e-8]
        if part=='torso' and z<P['hip']+.015*P['k']:
            t=clamp((P['hip']+.015*P['k']-z)/(.070*P['k']))
            right=clamp(.5+co[0]/(2*P['hipw']*.52))
            return [('hips',1-t),('thigh_l',t*(1-right)),('thigh_r',t*right)]
        return recipes['weights_for'](co,part,bd)
    pat=Patterns(pd,P,skin,recipes['torso_ctrl'](pd,P))
    pat.body_skin=lambda co,part:recipes['weights_for'](co,part,bd)
    body=pat.body();identity,proxy,bounds=identity_and_proxy(src,P,joints,skin)
    body.p=[(x,y,z-bottom) for x,y,z in body.p]
    bounds=tuple(np.asarray(v)+np.asarray([0,0,bottom]) for v in bounds)
    skinhex=pd['skin_hex'];rgb=[int(skinhex[i:i+2],16)/255 for i in (1,3,5)];linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    # Identity is rebound to the existing resident material by the opt-in loader.
    # It carries no new atlas image references or hidden duplicate GPU textures.
    g.g['materials']=[{'name':'wear_skin','pbrMetallicRoughness':{'baseColorFactor':linear+[1],'metallicFactor':0,'roughnessFactor':.82}}, {'name':'wear_identity_people_pbr','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.85}}, {'name':'wear_fabric','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.94}}, {'name':'wear_collision_proxy','pbrMetallicRoughness':{'baseColorFactor':[0,0,0,0]},'alphaMode':'BLEND'}]
    bodyname='wear_body_'+ident;identityname='wear_identity_'+ident;proxyname='wear_proxy_'+ident
    ba=g.mesh(bodyname,body,joints,0,extras={'components':body.components});g.mesh(bodyname+'_lod',body,joints,0,far=True,attrs=ba,visible=False,extras={'components':body.far_components})
    # The original source attributes are already resident in CharacterLibrary.
    # A valid plain glTF node records only the retained original triangle indices;
    # runtime borrows those existing BufferAttributes rather than uploading a
    # second full head. CPU validation decodes the same pinned original source.
    identity_index=len(g.g['nodes'])
    identity_accessor=g.accessor(np.asarray(identity.source_indices,dtype='<u2'),5123,'SCALAR',target=34963)
    g.g['nodes'].append({'name':identityname,'extras':{'sourceNode':'person_'+ident+'_mesh','sourceIndicesAccessor':identity_accessor}})
    g.g['nodes'][0]['children'].append(identity_index)
    g.mesh(proxyname,proxy,joints,3,visible=False,extras={'components':proxy.components,'encloses':identityname})
    fit={'file':'wear/'+ident+'.glb','bodyNode':bodyname,'bodyLodNode':bodyname+'_lod','identityNode':identityname,'identitySource':'people/people.glb','proxyNode':proxyname,'bodyComponents':body.components,'proxyComponents':proxy.components,'bodyTriangles':len(body.tri),'bodyFarTriangles':len(body.far),'identityTriangles':len(identity.tri),'garments':{},'jointNames':joints,'sourceSkin':src['skin']}
    fit['bodyFarComponents']=body.far_components
    fit['bodySourceProvenance']=body_provenance_reference(ident,body.sourceProvenance)
    for entry in catalog['garments']:
        gid=entry['id'];m=pat.garment(gid,bounds)
        lod_report=reduce_garment_far(m,ident+'/'+gid)
        choice=None
        m.p=[(x,y,z-bottom) for x,y,z in m.p]
        if len(m.tri)>1800:raise RuntimeError(f'{ident}/{gid}: {len(m.tri)} triangles >1800')
        if len(m.far)>600:raise RuntimeError(f'{ident}/{gid}: {len(m.far)} far triangles >600')
        name=f'wear_{gid}_{ident}';attrs=g.mesh(name,m,joints,2,visible=False,extras={'garment':gid,'fit':ident,'lod':0,**({'topologyChoice':choice} if choice and choice.get('application')=='raw-build' else {})})
        g.mesh(name+'_lod',m,joints,2,far=True,attrs=attrs,visible=False,extras={'garment':gid,'fit':ident,'lod':1})
        fit['garments'][gid]={'node':name,'lodNode':name+'_lod','tris':len(m.tri),'farTris':len(m.far),'vertices':g.g['accessors'][attrs['POSITION']]['count'],'skin':0}
        fit['garments'][gid]['lodReduction']=lod_report
    file=OUT/(ident+'.glb');g.save(file)
    # Rebuilding an already shipped fit replaces its owned compressed artifact,
    # so a normal author/build/fit cycle cannot leave two payload copies behind.
    compressed=Path(str(file)+'.gz')
    if compressed.exists():compressed.unlink()
    fit['gpuGeometryBytes']=g.gpu;fit['bytes']=file.stat().st_size;fit['sha256']=sha(file)
    lod_provenance_reference(ident,fit)
    return fit


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',nargs='+')
    parser.add_argument('--author-jobs',type=int,default=4,help='Number of isolated low-priority author workers (one to eight)')
    parser.add_argument('--resume-author',help='Retry a retained authoring checkpoint directory after fixing failed raw inputs')
    modes=parser.add_mutually_exclusive_group()
    modes.add_argument('--refresh-metadata',action='store_true')
    modes.add_argument('--fit-rest',action='store_true',help='Diagnostic rest-only vertex fit with a hard 80 mm correction limit')
    modes.add_argument('--fit-faces',action='store_true',help='Author fresh raw assets: static rest/idle clearance within 80 mm, CPU seated targets within the total 180 mm runtime bound')
    parser.add_argument('--gzip',action='store_true',help='Losslessly compress final GLBs and replace their raw copies (use after authoring fits)')
    args=parser.parse_args()
    if args.fit_rest or args.fit_faces:
        fit_rest(args.only,faces=args.fit_faces,author_jobs=args.author_jobs,resume_author=args.resume_author)
        if args.gzip:refresh_metadata(compress=True)
        return
    if args.refresh_metadata:refresh_metadata(compress=args.gzip);return
    OUT.mkdir(parents=True,exist_ok=True)
    recipes=source_recipes();catalog=json.loads((HERE/'people_wear.catalog.json').read_text())
    adults=[p for p in recipes['PEOPLE'] if p['kind'] in ('man','woman','elder')]
    if args.only:
        unknown=set(args.only)-{p['id'] for p in adults}
        if unknown:raise ValueError('Only adult resident IDs are accepted: '+', '.join(sorted(unknown)))
        adults=[p for p in adults if p['id'] in args.only]
    atlas_size=catalog['atlas']['size'];atlas(atlas_size);source=decode_source([p['id'] for p in adults])
    old=json.loads((OUT/'metadata.json').read_text()) if args.only and (OUT/'metadata.json').exists() else {}
    result={'schema':1,'adultOnly':True,'defaultEnabled':False,'sourcePeopleSha256':sha(SOURCE),'sourceClipBankSha256':sha(HERE/'people_clips.json.gz'),'sourceCatalogSha256':sha(HERE/'people_wear.catalog.json'),'atlas':{'file':'wear/wear_atlas.png','size':atlas_size,'grid':[4,4],'gpuBytes':math.ceil(atlas_size[0]*atlas_size[1]*4*4/3)},'fits':old.get('fits',{})}
    result['sourceInputs']=source_inputs()
    for pd in adults:
        fit=build_fit(pd,recipes,source,catalog);result['fits'][pd['id']]=fit
        print(f"wear {pd['id']}: {len(fit['garments'])} garments, {fit['bytes']} bytes, {fit['gpuGeometryBytes']} GPU geometry bytes",flush=True)
    result['fitIds']=sorted(result['fits']);result['gpuGeometryBytes']=sum(f['gpuGeometryBytes'] for f in result['fits'].values());result['gpuGrowthBytes']=result['gpuGeometryBytes']+result['atlas']['gpuBytes']
    if source_inputs()!=result['sourceInputs']:raise RuntimeError('Current people inputs changed during wardrobe generation')
    model_files=[ROOT/'assets/models'/f['file'] for f in result['fits'].values()]
    result['files']=[{'file':'wear/'+p.name,'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(model_files)]+[{'file':'wear/wear_atlas.png','bytes':(OUT/'wear_atlas.png').stat().st_size,'sha256':sha(OUT/'wear_atlas.png')}]
    (OUT/'metadata.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    print(f"wear total: {len(result['fits'])} adults, {result['gpuGrowthBytes']} GPU bytes including shared atlas",flush=True)
    if result['gpuGrowthBytes']>=12000000:raise RuntimeError('Wear GPU growth is not below 12 MB')
    if args.gzip:refresh_metadata(compress=True)


if __name__=='__main__':main()

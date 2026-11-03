"""Fresh complete wearable acceptance, using existing validators and tests.

Default --plan prints commands and audits dormant scope without running assets.
--run executes complete collision sweeps, named suites, every mapped mutation,
four strict sheets and the unchanged payload gate on the staged tree.
--run --resume admits complete same-input parts only through the unchanged
report merger; all later tests and browser/mutation stages run fresh again.
--mutations-only runs all five mapped Node mutation lanes on frozen inputs.
The browser fault lane additionally requires the passing four-sheet baseline.
--payload-only exports EVERY staged la-ladera file into a clean task-owned tree
and runs the unchanged payload gate there, with a complete exported inventory.
No test, model, manifest or budget is rewritten by this helper. The only fixed
output is a newly verified dev/wear/clearance.json used by the original tests.
Planning is never reported as execution; every claimed check has a fresh log.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
LADERA = ROOT/'la-ladera'
BASE = '38542092094aaf0101cc9920fd8628fcdaf0ac35'
PR85 = '7921cfe584d2d6c614da2c4810141a85a1c584c8'
ELIGIBLE = ['m_abuelo','m_afro','m_carnicero','m_don','m_elder','m_joven','m_mecanico','m_mototaxi','m_obrero','m_panadero','m_tendero','m_vendedor',
            'w_afro','w_ama','w_beata','w_cocinera','w_elder','w_farmaceutica','w_joven','w_maestra','w_peluquera','w_tendera','w_vecina']
EXCLUDED = {'CHILD':['b_boy','g_girl','b_escolar','g_escolar'], 'TEEN big':['t_boy','t_girl','m_rapado']}
JS_ALLOWED = ['la-ladera/js/people/'+name for name in ['rig.js','wear.js','wear_correction.js','wear_data.js','wear_geometry.js','wear_pose.js']]
TEXT = {'.py','.mjs','.js','.json','.html','.css','.md','.txt','.svg','.yml','.yaml','.csv','.log','.tap'}


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary=path.with_name(path.name+'.tmp')
    temporary.write_text(json.dumps(value, indent=2)+'\n', encoding='utf8')
    temporary.replace(path)


def relative(path):
    return str(Path(path).resolve().relative_to(ROOT))


def git(*args, input=None):
    return subprocess.check_output(['git',*args],cwd=ROOT,input=input)


def canonical(path, raw):
    return raw.replace(b'\r\n',b'\n') if Path(path).suffix.lower() in TEXT else raw


def source_snapshot():
    paths = set()
    for folder in ('assets','js','tests','tools','vendor'):
        for path in (LADERA/folder).rglob('*'):
            if path.is_file() and not any(part.startswith('.') or part == '__pycache__' for part in path.relative_to(LADERA/folder).parts):
                paths.add(path)
    for name in ('index.html','.gitattributes'):
        if (LADERA/name).is_file():
            paths.add(LADERA/name)
    paths.update((LADERA/'dev/wear/body-provenance').glob('*.json'))
    paths.update((LADERA/'dev/wear/lod-provenance').glob('*.json'))
    paths.update((LADERA/'dev/wear/authoring').rglob('*.json'))
    rows=[]
    for path in sorted(paths):
        raw=path.read_bytes(); data=canonical(path,raw)
        rows.append(dict(path=relative(path),form='LF' if path.suffix.lower() in TEXT else 'bytes',bytes=len(data),sha256=digest(data),
                         checkoutBytes=len(raw),checkoutSha256=digest(raw)))
    return dict(sha256=digest(json.dumps(rows,separators=(',',':')).encode()),files=rows)


def named_tests(path):
    source=path.read_text()
    names=re.findall(r"^test\('([^']+)'",source,re.M)
    table=re.search(r'^const cases = \[(.*?)^\];',source,re.M|re.S)
    if table and 'for (const [key, name] of cases) test(name,' in source:
        names+=re.findall(r"\['[^']+', '([^']+)'\]",table.group(1))
    need(names and len(names)==len(set(names)), relative(path)+': named tests must be explicit and unique')
    return names


def dormant_audit():
    main=git('rev-parse','origin/main').decode().strip()
    contains=subprocess.run(['git','merge-base','--is-ancestor',BASE,main],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
    changes=git('diff','--name-only',BASE,'--','la-ladera/js').decode().splitlines()
    untracked_js=git('ls-files','--others','--exclude-standard','--','la-ladera/js').decode().splitlines()
    outside=git('diff','--name-only',BASE,'--',':!la-ladera').decode().splitlines()
    outside+=git('ls-files','--others','--exclude-standard','--',':!la-ladera').decode().splitlines()
    pins=[]
    protected=['assets/models/manifest.people.json','assets/models/manifest.json',
               *['assets/models/people/'+name for name in ['people.glb','people_lod.glb','people_meta.json','people_albedo.jpg','people_normal.jpg','people_orm.jpg']],
               *['tools/blender/'+name+'.py' for name in ['people_body','people_body_limbs','people_tex','people_head','people_build','people_cast']],
               'tests/people-assets.test.mjs','tests/interiors-garments.test.mjs','tests/payload.mjs']
    for path in protected:
        current=canonical(path,(LADERA/path).read_bytes()); expected=git('cat-file','blob',BASE+':la-ladera/'+path)
        pins.append(dict(path='la-ladera/'+path,reference=BASE,same=current==expected,form='LF' if Path(path).suffix in TEXT else 'bytes',sha256=digest(current)))
    for path in JS_ALLOWED+['la-ladera/tests/people-wear.test.mjs','la-ladera/tests/people-wear-runtime.test.mjs',
                            'la-ladera/tests/people-wear-shots.mjs','la-ladera/tests/people-wear-gallery.mjs','la-ladera/tests/people-wear-gallery.html']:
        current=canonical(path,(ROOT/path).read_bytes());expected=git('cat-file','blob',PR85+':'+path)
        # Generated wear_data may be regenerated; its scope still remains exact.
        pins.append(dict(path=path,reference=PR85,same=current==expected,required=not path.endswith('/wear_data.js'),form='LF',sha256=digest(current)))
    production_mentions=[]
    pattern=re.compile(r'manifest\.people-wear|(?:import|from)[^\n]*(?:[\"\x27][^\"\x27]*wear(?:[_\.]|/))|new\s+WearLibrary')
    for path in list((LADERA/'js').rglob('*.js'))+[LADERA/'index.html']:
        if relative(path) in JS_ALLOWED:
            continue
        for index,line in enumerate(path.read_text().splitlines(),1):
            if pattern.search(line): production_mentions.append(dict(path=relative(path),line=index,text=line))
    manifest=json.loads((LADERA/'assets/models/manifest.json').read_text())
    catalog=json.loads((LADERA/'tools/blender/people_wear.catalog.json').read_text())
    meta=json.loads((LADERA/'assets/models/people/people_meta.json').read_text())
    excluded=sorted(set(row['id'] for row in meta['people'])-set(catalog['fits']))
    ok=contains and not outside and sorted(set(changes+untracked_js))==sorted(JS_ALLOWED) and not production_mentions
    ok=ok and all(row['same'] for row in pins if row.get('required',True))
    ok=ok and 'manifest.people-wear.json' not in manifest['files'] and catalog['adultOnly'] is True and catalog['defaultEnabled'] is False
    ok=ok and sorted(catalog['fits'])==ELIGIBLE and len(catalog['garments'])==23 and excluded==sorted(sum(EXCLUDED.values(),[]))
    return dict(ok=ok,base=BASE,originMain=main,mainContainsBase=contains,jsChanges=sorted(set(changes+untracked_js)),outsideChanges=outside,
                protectedPins=pins,productionMentions=production_mentions,wardrobeManifestDormant='manifest.people-wear.json' not in manifest['files'],
                adultOnly=catalog['adultOnly'],defaultEnabled=catalog['defaultEnabled'],eligible=ELIGIBLE,excludedBySize=EXCLUDED)


def run_command(command, stem, env, cwd=ROOT):
    out=stem.with_suffix('.stdout.log'); err=stem.with_suffix('.stderr.log')
    out.parent.mkdir(parents=True,exist_ok=True)
    started=now(); clock=time.monotonic()
    with out.open('wb') as stdout,err.open('wb') as stderr:
        result=subprocess.run(command,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    row=dict(command=command,cwd=str(cwd),startedAt=started,finishedAt=now(),seconds=time.monotonic()-clock,exitCode=result.returncode,
             stdout=dict(path=relative(out),bytes=out.stat().st_size,sha256LF=digest(out.read_bytes().replace(b'\r\n',b'\n'))),
             stderr=dict(path=relative(err),bytes=err.stat().st_size,sha256LF=digest(err.read_bytes().replace(b'\r\n',b'\n'))))
    print(json.dumps(dict(command=command[2:] if len(command)>2 else command,exitCode=result.returncode,seconds=round(row['seconds'],2))),flush=True)
    return row


def mutation_specs(node, out, suites):
    def load_tool(name):
        spec=importlib.util.spec_from_file_location('wear_audit_'+name,LADERA/'tools'/name)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module
    primary=load_tool('people_wear_mutations.py')
    cases=[row for path in sorted((LADERA/'tools').glob('people_wear_mutations_*.json')) for row in json.loads(path.read_text())]
    result=[dict(name='managed',command=[sys.executable,'la-ladera/tools/people_wear_mutations.py','--node',node,'--out',relative(out/'mutations/managed')],
                 report=relative(out/'mutations/managed/report.json'),cases=[{key:row[key] for key in ('id','suite','test')} for row in cases])]
    for name,stem,folder in [('authoring','people-wear-authoring','authoring-mutation-proof'),
                             ('packing','people-wear-pack','pack-mutation-proof'),
                             ('layout','people-wear-layout','layout-mutation-proof')]:
        runner=LADERA/'tests'/(stem+'-mutations.mjs');source=runner.read_text()
        table=re.search(r'^const mutations = \[(.*?)^\];',source,re.M|re.S)
        need(table is not None,relative(runner)+': missing explicit mutation catalog')
        pairs=re.findall(r"\['([^']+)', '([^']+)'\]",table.group(1))
        result.append(dict(name=name,command=[node,'--import','./la-ladera/tests/register.mjs',relative(runner)],report='la-ladera/dev/wear/'+folder+'/report.json',
                           cases=[dict(id=ident,suite='la-ladera/tests/'+stem+'.test.mjs',test=test) for ident,test in pairs]))
    external=load_tool('people_wear_authoring_mutations.py')
    result.append(dict(name='lod-and-faces',command=[sys.executable,'la-ladera/tools/people_wear_authoring_mutations.py','--node',node,'--out',relative(out/'mutations/lod-and-faces.json')],
                       report=relative(out/'mutations/lod-and-faces.json'),cases=[dict(id=row[1],suite='la-ladera/'+external.SUITES[row[0]][1],test=external.SUITES[row[0]][3][row[2]]) for row in external.CASES]))
    expected={(relative(path),name) for path in suites if path.name.startswith('people-wear') for name in named_tests(path)}
    mapped={(row['suite'],row['test']) for spec in result for row in spec['cases']}
    managed={(suite,name) for suite in primary.SUITES for name in named_tests(ROOT/suite)}
    need(managed=={(row['suite'],row['test']) for row in result[0]['cases']},'managed mutation catalog and declared suites differ')
    need(expected==mapped,'wearable named-test mutation mappings are missing, stale or extra: '+str(sorted(expected^mapped)))
    return dict(namedTests=len(expected),mutationCases=sum(len(spec['cases']) for spec in result),missing=[],lanes=result)


def run_mutations(specs, out, env):
    result=[]
    for spec in specs['lanes']:
        command=run_command(spec['command'],out/'mutations'/spec['name'],env)
        need(command['exitCode']==0,spec['name']+': mutation runner failed')
        path=ROOT/spec['report'];report=json.loads(path.read_text())
        need(report['node']=='v22.16.0',spec['name']+': mutation proof used another Node version')
        if spec['name']=='managed':
            need(report['complete'] and report['stable'] and report['killed']==report['mutants'], 'managed mutation proof is incomplete')
            rows=report['reports'];need(all(row['status']=='killed' for row in rows),'managed mutation survived')
        elif spec['name']=='lod-and-faces':
            need(report['ok'] and report['inputsUnchanged'],'LOD/face mutation inputs changed or checks failed')
            rows=report['mutants'];need(all(row['killed'] and row['applied'] and row['namedTestFailed'] for row in rows),'LOD/face mutant lacks a real named failure')
            for row in report['controls']+rows:
                original=ROOT/row['log'];copy=out/'mutations/lod-face-logs'/original.name
                copy.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(original,copy)
                need(digest(copy.read_bytes())==row['logSha256'],'copied LOD/face mutation log changed')
        else:
            need(report['pass'] and report['positiveExit']==0 and report['killed']==report['mutants'],spec['name']+': mutation proof failed')
            rows=report['results'];need(all(row['killed'] for row in rows),spec['name']+': mutation survived')
        actual_ids=[row.get('id',row.get('mutant')) for row in rows]
        need(len(rows)==len(spec['cases']) and sorted(actual_ids)==sorted(row['id'] for row in spec['cases']),spec['name']+': mutation cases were duplicated, omitted or changed')
        need({row['test'] for row in rows}=={row['test'] for row in spec['cases']},spec['name']+': named mutation coverage changed')
        result.append(dict(name=spec['name'],command=command,report=spec['report'],sha256=digest(path.read_bytes()),tests=len({row['test'] for row in rows}),mutants=len(rows)))
    return dict(ok=True,namedTests=specs['namedTests'],mutationCases=specs['mutationCases'],lanes=result)


def check_clearance(report):
    need(report.get('ok') and report.get('complete') and report.get('selectedComplete') and report.get('inventoryVerified') and report.get('collisionChecked'), 'fresh clearance is not a complete inventory-verified collision pass')
    need(report['mode']=='all' and report['samplesPerFit']==7763 and report['requiredClipCount']==32, 'clearance must use all 7,763 samples and 32 clips')
    need(sorted(row['id'] for row in report['fits'])==ELIGIBLE and not report['issues'], 'clearance omitted an eligible fit or retained issues')
    for fit in report['fits']:
        need(fit['garments']==23 and fit['poses']==7763 and fit['clipCoverage']==report['inputs']['sampling']['clips'],fit['id']+': incomplete design/pose coverage')
        need(fit['verticesPerPose']>0 and fit['vertexChecks']==fit['verticesPerPose']*7763,fit['id']+': incomplete vertex coverage')
        need(fit['identityVerticesPerPose']>0 and fit['proxyEnclosureChecks']==fit['identityVerticesPerPose']*7763,fit['id']+': incomplete retained-head checks')
        need(fit['rawRestClear'] and fit['rawRestChecks']==fit['verticesPerPose'] and fit['finalPenetrations']==0 and not fit['issues'],fit['id']+': failed raw/final clearance')
    need(report['modelBytes']<=6000000, 'wardrobe compressed-model budget exceeded')
    for row in report['inputs']['files']:
        raw=(LADERA/row['path']).read_bytes()
        if row.get('form')=='LF':raw=raw.replace(b'\r\n',b'\n')
        need(len(raw)==row['bytes'] and digest(raw)==row['sha256'],row['path']+': clearance input fingerprint changed')
    return dict(fits=23,designs=23,combinations=529,samplesPerFit=7763,clips=32,fitPoseStates=23*7763,
                designFitPoseStates=529*7763,lodDesignFitPoseStates=2*529*7763,vertexChecks=sum(f['vertexChecks'] for f in report['fits']),
                headEnclosureChecks=sum(f['proxyEnclosureChecks'] for f in report['fits']),modelBytes=report['modelBytes'])


def clean_payload(node, out, env):
    # Index files are exactly the proposed tree. Do not silently substitute
    # unstaged working copies or delete any intermediate authoring material.
    entries=git('ls-files','--stage','-z','--','la-ladera').split(b'\0')
    rows=[]; paths=[]
    for entry in filter(None,entries):
        header,path=entry.split(b'\t',1);mode,blob,stage=header.decode().split()
        need(stage=='0','unmerged index entry cannot be accepted')
        need(mode in ('100644','100755'),'payload export requires ordinary staged files')
        path=path.decode();paths.append(path);rows.append(dict(path=path,mode=mode,gitBlob=blob))
    need(paths,'empty staged payload tree')
    payload_tree=LADERA/'dev/.scratch'/('wear-payload-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f'))
    payload_tree.mkdir(parents=True)
    git('checkout-index','--prefix='+str(payload_tree)+os.sep,'--stdin','-z',input=('\0'.join(paths)+'\0').encode())
    for row in rows:
        source=ROOT/row['path']; exported=payload_tree/row['path'];raw=exported.read_bytes()
        # Text checkout bytes may differ solely because of autocrlf; binary and
        # canonical text content must match the proposed staged tree exactly.
        need(canonical(source,source.read_bytes())==canonical(exported,raw),row['path']+': stage current content before accepting payload')
        row.update(bytes=len(raw),sha256=digest(raw),canonicalSha256=digest(canonical(exported,raw)))
    # Ensure all current asset/runtime files are actually included in the index.
    staged=set(paths)
    for folder in ('assets','js'):
        for path in (LADERA/folder).rglob('*'):
            if path.is_file(): need(relative(path) in staged,relative(path)+': generated payload file is not staged')
    # The sparse repository can legitimately lack unrelated root blobs. Every
    # exported la-ladera blob above is still checked; this only records the
    # unchanged full index tree identity without materializing other projects.
    write(out/'payload-tree-inventory.json',dict(indexTree=git('write-tree','--missing-ok').decode().strip(),tree=relative(payload_tree),files=rows))
    result=run_command([node,'--import','./la-ladera/tests/register.mjs','la-ladera/tests/payload.mjs','--json'],out/'payload',env,cwd=payload_tree)
    report=json.loads((ROOT/result['stdout']['path']).read_text())
    need(result['exitCode']==0 and report['ok'],'unchanged payload validator failed on the complete staged tree')
    need(next(row['max'] for row in report['budgets'] if row['name']=='textures')==24,'the exact-base texture limit was changed')
    return dict(command=result,report=report,inventory=relative(out/'payload-tree-inventory.json'),exportTree=relative(payload_tree))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group();mode.add_argument('--run',action='store_true');mode.add_argument('--payload-only',action='store_true');mode.add_argument('--mutations-only',action='store_true');mode.add_argument('--plan',action='store_true')
    parser.add_argument('--node',default=os.environ.get('LADERA_NODE','node'))
    parser.add_argument('--out',default='la-ladera/dev/wear/acceptance')
    parser.add_argument('--jobs',type=int,default=2)
    parser.add_argument('--chrome',default=os.environ.get('CHROME_PATH','/usr/bin/google-chrome'))
    parser.add_argument('--resume',action='store_true',help='with --run, retain only original-merger-verified current-input clearance parts; rerun all later stages')
    args=parser.parse_args();need(1<=args.jobs<=4,'clearance jobs must be 1..4')
    need(not args.resume or args.run,'--resume requires --run')
    try:
        if os.getpriority(os.PRIO_PROCESS,0)<19:os.setpriority(os.PRIO_PROCESS,0,19)
    except (AttributeError,PermissionError):pass
    node=str(Path(shutil.which(args.node) or args.node).resolve())
    env=dict(os.environ,LADERA_PRIO='idle',CHROME_PATH=args.chrome)
    for name in ('LADERA_WEAR_MUTATION','LADERA_WEAR_TARGET_PREVIEW','WEAR_AUTHOR_MUTATION','WEAR_PACK_MUTATION','WEAR_LAYOUT_MUTATION','PEOPLE_WEAR_LOD_TEST_MODULE','PEOPLE_WEAR_FACE_TEST_MODULE'):
        env.pop(name,None)
    need(subprocess.check_output([node,'--version'],env=env,text=True).strip()=='v22.16.0','exact Node v22.16.0 is required')
    out=(ROOT/args.out).resolve();need(out.is_relative_to(LADERA/'dev'),'acceptance output must stay under la-ladera/dev')
    suites=sorted((LADERA/'tests').glob('people-wear*.test.mjs'))+[LADERA/'tests/people-assets.test.mjs',LADERA/'tests/interiors-garments.test.mjs']
    node_base=[node,'--import','./la-ladera/tests/register.mjs']
    commands=dict(people=node_base+['la-ladera/tools/blender/people_validate.mjs','--complete','--json'],
                  clearance=[node_base+['la-ladera/tools/blender/people_wear_validate.mjs','--mode','all','--fit',ident,'--progress','--report',relative(out/'clearance-parts'/f'{ident}.json')] for ident in ELIGIBLE],
                  tests=[dict(command=node_base+[relative(path)],names=named_tests(path)) for path in suites],
                  contactSheets=node_base+['la-ladera/tests/people-wear-shots.mjs','--out',relative(out/'sheets'),'--gpu','swiftshader'],
                  browserMutations=node_base+['la-ladera/tools/people_wear_browser_mutations.mjs','--baseline',relative(out/'sheets/people-wear-shots.json'),
                                              '--baseline-inputs',relative(out/'inputs-start.json'),'--out',relative(out/'browser-mutations')])
    browser_cases=re.findall(r"^  \{id:'([^']+)', test:'([^']+)'",(LADERA/'tools/people_wear_browser_mutations.mjs').read_text(),re.M)
    need(browser_cases and len(browser_cases)==len(set(row[0] for row in browser_cases)),'browser mutation mapping is empty or repeats an ID')
    audit=dormant_audit();mutations=mutation_specs(node,out,suites);plan=dict(node=node,jobs=args.jobs,out=relative(out),scope=audit,commands=commands,mutations=mutations,
      browserMutations=dict(tests=len(browser_cases),mutations=len(browser_cases),cases=[dict(id=ident,test=test) for ident,test in browser_cases],requiresPassingFourSheetBaseline=True),
      expectedCoverage=dict(fits=23,designs=23,combinations=529,samplesPerFit=7763,designFitPoseStates=4106627,lodDesignFitPoseStates=8213254),
      payload='Unchanged payload.mjs on every staged la-ladera file exported to a clean task-owned tree; 24 MiB texture limit retained.',
      mutationAudit='All five mapped Node mutation lanes run in --run or --mutations-only. The separate browser lane runs in --run after the strict four-sheet baseline. Planning does not count as execution.')
    if not args.run and not args.payload_only and not args.mutations_only:
        print(json.dumps(plan,indent=2));return 0 if audit['ok'] else 1
    out.mkdir(parents=True,exist_ok=True);need(audit['ok'],'dormant/protected-source scope audit failed')
    if args.payload_only:
        write(out/'payload-result.json',clean_payload(node,out,env));return 0
    if args.mutations_only:
        write(out/'plan.json',plan)
        initial=source_snapshot();write(out/'mutation-inputs-start.json',initial)
        result=run_mutations(mutations,out,env);final=source_snapshot();write(out/'mutation-inputs-end.json',final)
        result['inputsStable']=initial==final;result['ok']=result['ok'] and result['inputsStable'];write(out/'mutation-result.json',result)
        need(result['ok'],'mutation batch inputs changed');return 0
    need(Path(args.chrome).is_file(),'headless Chrome is required for the four strict contact sheets')
    existing=list((out/'clearance-parts').glob('*.json')) if (out/'clearance-parts').exists() else []
    need(args.resume or not existing,'clearance reports already exist; use --run --resume to verify same-input reuse or choose a fresh --out')
    attempt=out/'runs'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
    attempt.mkdir(parents=True)
    # Preserve previous attempt logs, screenshots and complete aggregate reports.
    # Only the fit-part paths are shared, allowing interrupted sweeps to resume.
    commands['contactSheets']=node_base+['la-ladera/tests/people-wear-shots.mjs','--out',relative(attempt/'sheets'),'--gpu','swiftshader']
    commands['browserMutations']=node_base+['la-ladera/tools/people_wear_browser_mutations.mjs','--baseline',relative(attempt/'sheets/people-wear-shots.json'),
                                          '--baseline-inputs',relative(attempt/'inputs-start.json'),'--out',relative(attempt/'browser-mutations')]
    mutations=mutation_specs(node,attempt,suites);plan.update(commands=commands,mutations=mutations,attempt=relative(attempt),resume=args.resume)
    write(attempt/'plan.json',plan);write(out/'latest.json',dict(attempt=relative(attempt),startedAt=now()))
    inputs=source_snapshot();write(attempt/'inputs-start.json',inputs)
    result=dict(startedAt=now(),node='v22.16.0',scope=audit,complete=False,commands=[],reusedParts=[],failures=[],mutationAudit=plan['mutationAudit'],attempt=relative(attempt),prePayloadComplete=False)
    def checkpoint():
        write(attempt/'progress.json',result)
    try:
        people=run_command(commands['people'],attempt/'people-complete',env);result['commands'].append(people)
        p=json.loads((ROOT/people['stdout']['path']).read_text());need(people['exitCode']==0 and p['ok'] and p['complete'] and len(p['people'])==30 and p['clips']==32,'complete people validation failed')
        checkpoint()
        (out/'clearance-parts').mkdir(exist_ok=True)
        reusable=set()
        if args.resume:
            resume_command=node_base+['la-ladera/tools/people_wear_resume.mjs','--parts',relative(out/'clearance-parts'),'--report',relative(attempt/'resume.json')]
            resumed=run_command(resume_command,attempt/'resume',env);result['commands'].append(resumed)
            need(resumed['exitCode']==0,'existing clearance inputs changed or current structure failed; preserve these reports and choose a fresh output folder')
            resume_report=json.loads((attempt/'resume.json').read_text());need(resume_report['compatible'],'cached reports belong to different inputs')
            result['reusedParts']=resume_report['reusable'];reusable={row['id'] for row in resume_report['reusable']}
            result['resumeProof']=dict(path=relative(attempt/'resume.json'),sha256=digest((attempt/'resume.json').read_bytes()))
            checkpoint()
        pending=[(ident,command) for ident,command in zip(ELIGIBLE,commands['clearance']) if ident not in reusable]
        for ident,_ in pending:
            old=out/'clearance-parts'/f'{ident}.json'
            if old.exists():
                previous=attempt/'previous-failed-parts'/old.name;previous.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(old,previous)
        with ThreadPoolExecutor(max_workers=args.jobs) as executor:
            futures={executor.submit(run_command,command,attempt/'clearance-parts'/ident,env):ident for ident,command in pending}
            for future in as_completed(futures):
                ident=futures[future];row=future.result();result['commands'].append(row)
                part=out/'clearance-parts'/f'{ident}.json'
                write(out/'clearance-parts'/f'{ident}.command.json',dict(command=row,report=dict(path=relative(part),sha256=digest(part.read_bytes())) if part.exists() else None))
                checkpoint()
        need(all(row['exitCode']==0 for row in result['commands']),'one or more complete clearance parts failed; no fresh certificate published')
        aggregate=node_base+['la-ladera/tools/blender/people_wear_validate.mjs','--mode','all','--aggregate',','.join(relative(out/'clearance-parts'/f'{ident}.json') for ident in ELIGIBLE),'--report',relative(attempt/'clearance.json')]
        merged=run_command(aggregate,attempt/'clearance-aggregate',env);result['commands'].append(merged)
        need(merged['exitCode']==0,'complete clearance aggregation failed')
        result['coverage']=check_clearance(json.loads((attempt/'clearance.json').read_text()))
        shutil.copyfile(attempt/'clearance.json',out/'clearance.json');shutil.copyfile(attempt/'clearance.json',LADERA/'dev/wear/clearance.json')
        result['freshCertificate']=dict(path='la-ladera/dev/wear/clearance.json',sha256=digest((attempt/'clearance.json').read_bytes()))
        checkpoint()
        for path,spec in zip(suites,commands['tests']):
            row=run_command(spec['command'],attempt/'tests'/path.stem,env);result['commands'].append(row)
            tap=(ROOT/row['stdout']['path']).read_text();passed=set(re.findall(r'^ok \d+ - (.+)$',tap,re.M))
            row['expectedNamedTests']=len(spec['names']);row['missingNamedPasses']=sorted(set(spec['names'])-passed)
            need(row['exitCode']==0 and not row['missingNamedPasses'] and not re.search(r'^not ok ',tap,re.M),relative(path)+': a named test failed or emitted no real TAP')
            checkpoint()
        shots=run_command(commands['contactSheets'],attempt/'contact-sheets',env);result['commands'].append(shots)
        sheets=json.loads((attempt/'sheets/people-wear-shots.json').read_text())
        need(shots['exitCode']==0 and sheets['ok'] and not sheets['failures'],'strict contact-sheet runtime or browser checks failed')
        expected={('contact-near.jpg',0,'idle_a',.27),('contact-far.jpg',1,'idle_a',.27),('contact-walk.jpg',0,'walk',.19),('contact-seated.jpg',0,'sit_idle',.25)}
        need({(s['file'],s['lod'],s['clip'],s['phase']) for s in sheets['sheets']}==expected,'not all four exact contact-sheet requests completed')
        for sheet in sheets['sheets']:
            need(len(sheet['rows'])==23 and all([f['id'] for f in row['fits']]==['w_joven','m_tendero','w_vecina'] for row in sheet['rows']),'contact sheet omitted a design or evidence body')
        result['contactSheets']=[dict(path=relative(attempt/'sheets'/s['file']),sha256=digest((attempt/'sheets'/s['file']).read_bytes())) for s in sheets['sheets']]
        checkpoint()
        browser_mutations=run_command(commands['browserMutations'],attempt/'browser-mutations',env);result['commands'].append(browser_mutations)
        browser_proof=json.loads((attempt/'browser-mutations/report.json').read_text())
        need(browser_mutations['exitCode']==0 and browser_proof['ok'] and browser_proof['complete'] and browser_proof['inputsStable'],'browser mutation evidence did not pass on stable inputs')
        need(browser_proof['killed']==len(browser_cases) and {row['id'] for row in browser_proof['mutants']}=={row[0] for row in browser_cases},'browser mutation cases were omitted or changed')
        result['browserMutations']=dict(report=relative(attempt/'browser-mutations/report.json'),sha256=digest((attempt/'browser-mutations/report.json').read_bytes()),
                                       tests=len(browser_cases),killed=browser_proof['killed'])
        checkpoint()
        result['mutations']=run_mutations(mutations,attempt,env)
        result['prePayloadComplete']=True;checkpoint()
        result['payload']=clean_payload(node,attempt,env)
    except Exception as error:
        result['failures'].append(str(error))
    final=source_snapshot();write(attempt/'inputs-end.json',final)
    result['inputsStable']=inputs==final
    if not result['inputsStable']:result['failures'].append('acceptance inputs changed during execution')
    result['finishedAt']=now();result['ok']=not result['failures']
    result['validationBatchComplete']=result['ok'];result['complete']=False
    result['completionScope']='Complete validators, named tests, all mapped mutations, contact sheets and payload. Human review of the four rendered sheets remains mandatory.'
    write(attempt/'result.json',result);write(out/'result.json',result);print(json.dumps({key:result.get(key) for key in ['ok','complete','validationBatchComplete','coverage','failures','completionScope']},indent=2))
    return 0 if result['ok'] else 1


if __name__=='__main__':
    raise SystemExit(main())

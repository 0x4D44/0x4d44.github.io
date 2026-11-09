"""GPU train capture checks in Node. No Chrome or real TD fixtures; named assertions must kill mutants."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

src = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
if not out.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('output must be under worktree .scratch')
out.mkdir(parents=True, exist_ok=True)
C, F, R = 'tools/train-capture.mjs', 'tools/train-framing.mjs', 'tools/capture-runtime.mjs'
M = [
 ('no measured movement required', C, '&&c.movedM>=1', '&&true'),
 ('all-day capture completeness ignored', C, "if(missing.length)throw new Error(`no measured sequence candidates", "if(false)throw new Error(`no measured sequence candidates"),
 ('one bad sequence aborts the run', C, 'catch(error){failed.push(', 'catch(error){throw error;failed.push('),
 ('missing sequence exits zero', C, 'exitCode:missing.length?1:0', 'exitCode:0'),
 ('wrong replay clock accepted', C, 'actual.timeMs!==expected.timeMs', 'false'),
 ('wrong physical train accepted', C, 'actual.id!==plan.trainId', 'false'),
 ('wrong body position accepted', C, 'Math.hypot(actual.point[0]-expected.point[0],actual.point[1]-expected.point[1])>.05', 'false'),
 ('unrendered train accepted', C, '!actual.rendered', 'false'),
 ('wrong formation accepted', C, 'Math.abs(actual.lengthM-expected.lengthM)>1e-6', 'false'),
 ('wrong occupied track accepted', C, '||!bodyMatches||', '||false||'),
 ('schedule can change formations', C, "return {status:404,type:'application/json'", "return {status:200,type:'application/json'"),
 ('frozen input fingerprint ignored', C, "!==entry.sha256)throw", "!==entry.sha256&&false)throw"),
 ('catalogue train staged in tunnel', C, 'if(!rail.tunnel)', 'if(true)'),
 ('catalogue train staged over platform', C, '||nearPlatform(mid)||nearPlatform(a)||nearPlatform(b)', ''),
 ('catalogue coach need not fit its edge', C, 'length<lengthM+2', 'false'),
 ('buffer absent from camera corridor', C, 'if(stop)points.push(', 'if(false)points.push('),
 ('three metre detail is four metres', F, 'addScaledVector(across,3)', 'addScaledVector(across,4)'),
 ('detail ignores terrain', F, "if(groundY!==undefined&&(!Number.isFinite(groundY)||position.y<groundY+.25))", 'if(false)'),
 ('fixed sequence camera below terrain', F, 'position.y=Math.max(position.y,groundY+.5)', 'position.y=position.y'),
 ('overview orbit clamp moves closeup', F, 'controls.minDistance=0', 'controls.minDistance=8'),
 ('external occluders ignored', F, 'hits.find(h=>!belongs(h.object,group)&&h.distance<Math.min(distance,own?.distance??distance)-.002)', 'undefined'),
 ('clipped coach accepted', F, 'Math.abs(p.x)>.91 || Math.abs(p.y)>.91', 'Math.abs(p.x)>100 || Math.abs(p.y)>100'),
 ('tiny coach accepted', F, 'span < minScreenSpan', 'false'),
 ('actual coach surfaces ignored', F, "!/^(body-shell|body-detail|cab-glass)$/.test(o.name)", 'true'),
 ('forward replay reloads for every frame', C, 'index!==recordingIndex||atMs<time', 'true'),
 ('replay seeks on absolute epoch', C, 'seek(atMs-session.start,atMs)', 'seek(atMs,atMs)'),
 ('signals disabled in captures', C, '&speed=1&board=0', '&speed=1&signals=0&board=0'),
 ('S class table is not served', C, "u.pathname==='/relay/sclass'&&frozen.table", 'false'),
 ('camera alternatives unbounded', C, 'alternatives.slice(0,6)', 'alternatives'),
 ('failed phase timing lost', C, 'finally{timings.push', 'finally{if(false)timings.push'),
 ('follow camera uses whole consist instead of leading coach', F, 'trainBounds(T,coach),centre', 'trainBounds(T,group),centre'),
 ('follow camera is a station overview', F, 'const distance=[42,52,64]', 'const distance=[242,252,264]'),
 ('vertical train readability ignored', F, 'verticalSpan<minVerticalSpan', 'false'),
 ('chunk hits lose original mesh identity', F, 'hit.object=mesh;hits.push(hit)', 'hits.push(hit)'),
 ('only browser parent receives deadline signals', R, 'kill(-child.pid,signal)', 'kill(child.pid,signal)'),
 ('browser group not forced after deadline', R, "force=setTimer(()=>signalGroup('SIGKILL'),graceMs)", 'force=setTimer(()=>{},graceMs)'),
 ('cleanup ignores living descendants', R, 'parentExited&&!alive()', 'parentExited'),
 ('profile cleanup failure loses retention record', R, '(!exited||warnings.length)?profile:null', '(!exited)?profile:null'),
 ('future candidate headcode overrides recorded frame', C, 'expected.description??plan.description', 'plan.description'),
 ('frame description enrichment ignores rename', C, 'target.frame.description=train.description', "target.frame.description='BEFORE'"),
 ('undrawn large mesh triangles become occluders', F, 'geometry.drawRange.count<(index?.count??positions.count)', 'false'),
]
def run(work):
    return subprocess.run(['node','--test','--test-reporter=tap','--test-timeout=20000','tools/tests/train-capture.test.mjs'], cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)
with tempfile.TemporaryDirectory(prefix='train-capture-', dir=out) as directory:
    work=Path(directory)/'kings-cross-src'
    for name in ['tools','core','web']:
        shutil.copytree(src/name, work/name)
    shutil.copy2(src/'package.json',work/'package.json')
    (work/'node_modules').symlink_to(src/'node_modules',target_is_directory=True)
    (work.parent/'.scratch').mkdir()
    baseline=run(work)
    if baseline.returncode:raise SystemExit(baseline.stdout+baseline.stderr)
    names=set(re.findall(r'^ok \d+ - (.+)$',baseline.stdout,re.M));seen=set();survivors=[]
    for label,target,old,new in M:
        file=work/target;original=file.read_text()
        if old not in original:raise SystemExit('missing mutation pattern: '+label)
        file.write_text(original.replace(old,new,1));result=run(work);file.write_text(original)
        failed=set()
        for block in re.split(r'(?=^not ok \d+ - )',result.stdout,flags=re.M)[1:]:
            block=re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)',block,maxsplit=1,flags=re.M)[0]
            match=re.match(r'not ok \d+ - ([^\n]+)',block)
            if match and 'ERR_ASSERTION' in block:failed.add(match[1])
        all_failed=set(re.findall(r'^not ok \d+ - (.+)$',result.stdout,re.M))
        actual=set(re.findall(r'^(?:ok|not ok) \d+ - (.+)$',result.stdout,re.M))
        if result.returncode and failed and all_failed==failed and actual==names and not result.stderr:
            seen.update(failed);print('[CAUGHT] '+label,flush=True)
        else:
            survivors.append(label);(out/(str(len(survivors))+'.log')).write_text(result.stdout+result.stderr);print('[SURVIVED] '+label,flush=True)
    print(f'{len(M)-len(survivors)}/{len(M)} caught; survivors: {survivors}')
    print(f'{len(names&seen)}/{len(names)} tests observed failing; never failed: {sorted(names-seen)}')
    raise SystemExit(1 if survivors or names-seen else 0)

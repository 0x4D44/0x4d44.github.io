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
 ('frozen relay discovery blocks timetable loading', C, "if(u.pathname==='/relay/health')return", "if(u.pathname==='/relay/no-health')return"),
 ('follow CDP failure drops named ray diagnostics', C, '{details:value.failure.details??null}', '{details:null}'),
 ('follow alternatives retain the old distant views', F, 'distance=[42,34,28][index]', 'distance=[42,52,64][index]'),
 ('follow alternatives retain the old shallow elevation', F, 'distance*[.32,.48,.8][index]', 'distance*.32'),
 ('frozen dated schedule not served', C, "const schedule=frozen.schedules?.get(u.searchParams.get('date'));", 'const schedule=undefined;'),
 ('frozen schedule birth day ignored', C, "const calls=schedules.get(new Date(atTime).toISOString().slice(0,10))?.calls;", 'const calls=undefined;'),
 ('frame enrichment ignores scheduled birth resolver', C, 'const candidates=structuredClone(report.captureCandidates),graph=buildGraph(data);', 'serviceFor=()=>undefined;const candidates=structuredClone(report.captureCandidates),graph=buildGraph(data);'),
 ('portal planning ignores scheduled birth resolver', C, 'export function portalCapturePlan(recordings,data,anchors,serviceFor=()=>undefined) {', 'export function portalCapturePlan(recordings,data,anchors,serviceFor=()=>undefined) { serviceFor=()=>undefined;'),
 ('portal canonical seek ignores scheduled birth resolver', C, 'const canonicalKinds=createTrainKinds(serviceFor)', 'const canonicalKinds=createTrainKinds(()=>undefined)'),
 ('portal entry accepts stationary frame', C, '||f.speedMps<=.05', ''),
 ('portal sequence accepts backward time', C, '||(i&&f.timeMs<=frames[i-1].timeMs)', ''),
 ('portal capture skips face metadata', C, '!p?.portal||', ''),
 ('portal selection captures the leading end instead of the final coaches', C, '[lengthM-remainingM,lengthM-remainingM*.75,lengthM-remainingM*.5,lengthM-remainingM*.25,lengthM+4]', '[-8,-2,2,8]'),
 ('portal camera crosses the city again', F, 'const distance=[45,60,78][index]', 'const distance=[245,260,278][index]'),
 ('portal body bins drop shallow visible sides', F, '<=1e-6)return;', '<.2)return;'),
 ('portal blocker name lost from failure', C, 'blocker:visibility?.blocker??null', 'blocker:null'),
 ('portal blocker distance lost from failure', C, 'occluder:visibility?.occluder??null', 'occluder:null'),
 ('portal fixed camera moves between frames', C, '!sameCamera(frame.camera)', 'false'),
 ('portal entry accepts nondecreasing visible length', C, 'frames[i-1].visibility.visibleLengthM-length<=.5', 'false'),
 ('portal entry accepts backward frame times', C, 'frame.timeMs<=frames[i-1].timeMs', 'false'),
 ('portal entry starts with no measurable train', C, 'first.visibility.visibleLengthM<4', 'false'),
 ('portal entry accepts track never rendered', C, '!first.visibility.track.rendered', 'false'),
 ('portal camera is reset for every frame', C, 'inspect(expected,candidate,camera)', 'inspect(expected,candidate,undefined)'),
 ('portal frame images published before sequence validation', C, 'pictures.push(await picture(expected,actual))', 'pictures.push(await picture(expected,actual));await publish(expected,actual,pictures.at(-1))'),
 ('portal sequence validation not run by capture', C, 'validation=verifyPortalSequence(frames)', 'validation={decreaseM:26}'),
 ('portal alternatives stop before sixth candidate', C, 'candidate<6', 'candidate<3'),
 ('portal camera stays below drawn terrain', F, 'position.y=Math.max(3.5,groundY+.5)', 'position.y=8'),
 ('portal camera clips remaining exterior body', F, 'Math.abs(n.x)<.84&&Math.abs(n.y)<.84', 'Math.abs(n.x)<100&&Math.abs(n.y)<100'),
 ('outside train allowed to disappear', F, 'if(outsideFailure)return fail(', 'if(false)return fail('),
 ('train passes through tunnel cover visibly', F, 'if(buriedFailure)return fail(', 'if(false)return fail('),
 ('transparent scenery conceals physical train', F, '(!m?.transparent||m.opacity>=.98)', 'true'),
 ('portal capture clips exterior body', F, 'if(outside&&!visible)', 'if(outside&&!visible&&framed)'),
 ('portal track check ignored', F, "if(!track)return fail('track not visibly", "if(false)return fail('track not visibly"),
 ('unrelated grid mistaken for tunnel track', F, "o.name!=='track-tunnel'||", ''),
 ('off-bore track accepted as aperture evidence', F, 'Math.abs(portalCoordinates(p,portal).u)>bore.width/2-.15', 'false'),
 ('elevated line accepted as railhead', F, '||Math.abs(p.y)>.02', ''),
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
 ('follow camera is a station overview', F, 'distance=[42,34,28][index]', 'distance=[242,252,264][index]'),
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
    return subprocess.run(['node','--test','--test-reporter=tap','--test-timeout=20000','tools/tests/train-capture.test.mjs','tools/tests/train-capture-schedule.test.mjs','tools/tests/train-framing.test.mjs','tools/tests/portal-entry.test.mjs'], cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)
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

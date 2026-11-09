"""GPU train capture checks in Node. No Chrome or real TD fixtures; named assertions must kill mutants."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
# optional third argument: run only the mutants whose label contains it (a quick check while writing tests; the full run takes none)
only = sys.argv[3] if len(sys.argv) > 3 else None
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
 # ---- catalogue mode (rubric-FROZEN-v1, views V01-V10): pose maths, neutral stage, per-view checks, run loop, frozen poses, argv ----
 ('nose three-quarter view stands 6 m out, not 5', F, 'eye: [sx * 4.5, 1.7, -5]', 'eye: [sx * 4.5, 1.7, -6]'),
 ('rear view keeps the front frame for its eye', F, 'view.eye = flip(o.eye); view.target = flip(o.target);', 'view.eye = o.eye; view.target = flip(o.target);'),
 ('rear frame forgets to mirror across the train', F, '[q6(-p[0]), q6(p[1]), q6(length - p[2])]', '[q6(p[0]), q6(p[1]), q6(length - p[2])]'),
 ('face-on view stands 4 m from the nose, not 3', F, "rear ? 'rear-3m' : 'front-3m', { rear, eye: [0, 1.7, -3]", "rear ? 'rear-3m' : 'front-3m', { rear, eye: [0, 1.7, -4]"),
 ('cab side view stands 4 m out, not 3', F, 'eye: [sx * (half + 3), 1.85, bogie0]', 'eye: [sx * (half + 4), 1.85, bogie0]'),
 ('window junction offset is half a metre, not 0.9', F, 'z: q6(doorZ + toward * (f.doorWidth / 2 + .9))', 'z: q6(doorZ + toward * (f.doorWidth / 2 + .5))'),
 ('window junction steps away from the car centre', F, 'const toward = doorZ < (car.start + car.end) / 2 ? 1 : -1;', 'const toward = doorZ < (car.start + car.end) / 2 ? -1 : 1;'),
 ('car and train fit 90% of the width, not 84%', F, 'fitFraction: .84,', 'fitFraction: .9,'),
 ('fit distance ignores the aspect ratio', F, 'return extentM / (2 * Math.tan(fovDeg * D2R / 2) * aspect * fraction);', 'return extentM / (2 * Math.tan(fovDeg * D2R / 2) * fraction);'),
 ('fit distance rounds down, so the car can exceed 84%', F, 'Math.ceil(v * 1000 - 1e-9) / 1000', 'Math.floor(v * 1000) / 1000'),
 ('near plane is a tenth of the distance', F, 'Math.round(hypot3(eye, target) * 10) / 1000', 'Math.round(hypot3(eye, target) * 100) / 1000'),
 ('near plane floor is 30 cm', F, 'Math.min(4, Math.max(.03, ', 'Math.min(4, Math.max(.3, '),
 ('near plane cap is 40 m', F, 'Math.min(4, Math.max(.03, ', 'Math.min(40, Math.max(.03, '),
 ('stage rotation ignores the sun', F, 'const rotationY = wrap(sunAz - (camera + step));', 'const rotationY = wrap(-(camera + step));'),
 ('sun offset is 35 degrees, not 15', F, 'sunOffsetDeg: 15,', 'sunOffsetDeg: 35,'),
 ('sun is nudged away from the lateral axis', F, 'const toward = wrap(lateral - camera);', 'const toward = wrap(camera - lateral);'),
 ('plan view has a camera bearing of zero', F, 'const camera = plan ? 135 * D2R : Math.atan2(dx, dz);', 'const camera = plan ? 0 : Math.atan2(dx, dz);'),
 ('sun always nudged toward the right axis', F, 'const lateral = Math.sin(camera) < -1e-9 ? -Math.PI / 2 : Math.PI / 2;', 'const lateral = Math.PI / 2;'),
 ('motor bogie search picks trailers', F, 'if (car.motor[k] === motor) return', 'if (car.motor[k] !== motor) return'),
 ('trailer bogie view shows a motor bogie', F, 'const m = chooseBogie(f, true), t = chooseBogie(f, false);', 'const m = chooseBogie(f, true), t = chooseBogie(f, true);'),
 ('no joint is a unit coupling', F, "unit: car.cab === 'rear' && f.cars[index + 1].cab === 'front'", 'unit: false'),
 ('mid-train joint tie goes to the higher index', F, 'Math.abs(j.z - z) < Math.abs(best.z - z) - 1e-6', 'Math.abs(j.z - z) <= Math.abs(best.z - z) + 1e-6'),
 ('mid-train gangway may be a unit coupling', F, 'const mid = nearestJoint(ordinary, L / 2);', 'const mid = nearestJoint(joints, L / 2);'),
 ('low coupling view stands level with the joint', F, 'eye: [half + 2, 1.2, j.z - 1.5]', 'eye: [half + 2, 1.2, j.z]'),
 ('first gangway is the second joint', F, "push('V08', 'gangway', straight(joints[0]));", "push('V08', 'gangway', straight(joints[1]));"),
 ('roof front view aims at the last pantograph', F, 'const zFront = q6(zOf(panto[0]))', 'const zFront = q6(zOf(panto.at(-1)))'),
 ('roof plan height fitted for the wrong lens', F, 'const h = q6(H + ceil3(fitDistance(L, 50)));', 'const h = q6(H + ceil3(fitDistance(L, 25)));'),
 ('roof plan is not turned along the train', F, 'up: [1, 0, 0], fov: 50', 'up: [0, 0, 1], fov: 50'),
 ('train without a pantograph aims at the first car', F, ': centre(mid);', ': centre(cars[0]);'),
 ('train without a pantograph aims off the middle car', F, 'mid = cars[Math.floor(n / 2)]', 'mid = cars[Math.floor(n / 2) - 1]'),
 ('rear cab car view is the second-last car', F, "[n - 1, 'rear-cab-car-side']", "[n - 2, 'rear-cab-car-side']"),
 ('whole-train distance fitted for the wrong lens', F, 'const d = ceil3(fitDistance(L, 25)), z = q6(L / 2);', 'const d = ceil3(fitDistance(L, 50)), z = q6(L / 2);'),
 ('running gear is viewed from the right', F, 'const side = -1, one = ', 'const side = 1, one = '),
 ('underframe view looks at car 2', F, 'const c1 = q6(centre(cars[1]));', 'const c1 = q6(centre(cars[2]));'),
 ('lamp views use another pose than the face-on view', F, "push('V09', `lights-${state}`, { eye: [0, 1.7, -3]", "push('V09', `lights-${state}`, { eye: [0, 1.7, -2]"),
 ('both lamp views ask for the leading state', F, "capability: { function: 'setTrainLampState', state, reason: lampReason }", "capability: { function: 'setTrainLampState', state: 'leading', reason: lampReason }"),
 ('frozen pose loses the specimen turn', F, 'car: v.car, rotationY: v.rotation?.rotationY });', 'car: v.car, rotationY: 0 });'),
 ('pose comparison has no tolerance', F, 'Math.abs(a - b) <= tol ? null : path', 'a === b ? null : path'),
 ('station candidates may be off the platforms', F, 'const platform = platforms.find(p => inside(xz, p.pts));', "const platform = platforms.find(p => inside(xz, p.pts)) ?? { ref: 'none' };"),
 ('station candidates are not at the asked distance', F, 'distanceM * Math.sin(az * D2R)', 'distanceM * 1.01 * Math.sin(az * D2R)'),
 ('station eye is 1.5 m above the platform', F, 'platformHeightM + CATALOGUE.eyeAbovePlatformM', 'platformHeightM + 1.5'),
 ('station distance is not asserted', F, 'if (Math.abs(horizontal - distanceM) >= 1e-6) throw', 'if (Math.abs(horizontal - distanceM) >= 1) throw'),
 ('station candidates ignore the preferred bearing', F, 'a.preference - b.preference || a.azimuthDeg - b.azimuthDeg', 'a.azimuthDeg - b.azimuthDeg'),
 ('stage ballast is 3.0 m wide', F, 'new T.BoxGeometry(3.4, .06, span)', 'new T.BoxGeometry(3.0, .06, span)'),
 ('stage rails are a third of the gauge from the middle', F, 'sx * CATALOGUE.gaugeM / 2, -.05, mid', 'sx * CATALOGUE.gaugeM / 3, -.05, mid'),
 ('stage rail head top is below zero', F, '0xa0a4aa, sx * CATALOGUE.gaugeM / 2, -.05, mid', '0xa0a4aa, sx * CATALOGUE.gaugeM / 2, -.07, mid'),
 ('stage stops 6 m past the ends of the train', F, '{ length, margin = 60 } = {}', '{ length, margin = 6 } = {}'),
 ('stage sleepers are 0.6 m apart', F, 'Math.floor(span / .65)', 'Math.floor(span / .6)'),
 ('hiding the scenery hides the lights', F, 'if (!o.isLight && !o.userData?.captureOwned && o.visible)', 'if (!o.userData?.captureOwned && o.visible)'),
 ('hiding the scenery hides the stage', F, 'if (!o.isLight && !o.userData?.captureOwned && o.visible)', 'if (!o.isLight && o.visible)'),
 ('stage does not turn with the specimen', F, 'for (const o of [group, stage]) { o.position.set(', 'for (const o of [group]) { o.position.set('),
 ('train costs ignore the draw range', F, 'Math.min(g.drawRange.count, (g.index?.count', 'Math.min(Infinity, (g.index?.count'),
 ('train costs count hidden material groups', F, 'if (o.material[part.materialIndex]?.visible !== false) {', 'if (true) {'),
 ('catalogue view ignores the specimen transform', F, 'const eye = group.localToWorld(new T.Vector3(...view.eye)), target =', 'const eye = new T.Vector3(...view.eye), target ='),
 ('plan view up is not turned with the specimen', F, 'new T.Vector3(...view.up).transformDirection(group.matrixWorld).toArray()', 'new T.Vector3(...view.up).toArray()'),
 ('camera position error is not measured', F, 'Math.hypot(...position.map((v, i) => v - planned.plannedPosition[i]))', '0'),
 ('a camera inside a car is not inside', F, 'if (CAR_ENVELOPE_NAMES.includes(mesh.name) && !mesh.isInstancedMesh) {', 'if (false) {'),
 ('one odd ray puts a camera inside a mesh', F, 'if (odd >= 5) return mesh;', 'if (odd >= 1) return mesh;'),
 ('a ray through a triangle seam counts twice', F, 'if (hit.distance - last > 1e-6) crossings++;', 'crossings++;'),
 ('back faces count as visible surface', F, 'if (n.dot(q.subVectors(camera.position, s).normalize()) < minFacing) continue;', 'if (n.dot(q.subVectors(camera.position, s).normalize()) < -1) continue;'),
 ('long triangles are not subdivided', F, 'N = Math.min(8, Math.max(1,', 'N = Math.min(1, Math.max(1,'),
 ('extreme sample points are dropped', F, 'for (const i of [lx, hx, ly, hy]) chosen.add(i);', ''),
 ('hidden samples need no visibility', F, 'minVisibleFraction = .2', 'minVisibleFraction = 0'),
 ('frame margin is the whole frame', F, 'margin = .91', 'margin = 2'),
 ('tiny region accepted', F, 'minScreenSpan = .05', 'minScreenSpan = 0'),
 ('subject may exceed 84% of the width', F, '> extentFraction + 1e-6', '> 10'),
 ('subject may be much smaller than its limit', F, 'if (extents.widthFraction < .7 * extentFraction)', 'if (false)'),
 ('camera clearance above the stage ground is dropped', F, 'camera.position.y < groundY + .25))', 'camera.position.y < groundY - 5))'),
 ('catalogue view ignores obstacles in front of the train', F, 'const hit = hits.find(h => !belongs(h.object, group) && h.distance < Math.min(distance, own?.distance ?? distance) - .002);', 'const hit = undefined;'),
 ('every sample counts as seen', F, 'if (own.distance >= distance - .03) { seen++;', 'if (true) { seen++;'),
 ('level of detail not followed from the camera', F, 'group.traverse(o => { if (o.isLOD) o.update(camera); });', ''),
 ('capture view default near plane is 5 cm', F, 'fov, up, near=.03) {', 'fov, up, near=.05) {'),
 ('capture view ignores the up vector', F, 'camera.up.set(...(up??[0,1,0]));', 'camera.up.set(0,1,0);'),
 ('frozen view uses the derived eye', C, 'return {...view,frame:p.frame,eye:p.eye,', 'return {...view,frame:p.frame,eye:view.eye,'),
 ('frozen poses accept a kind they do not hold', C, "if(!held){drifts.push({kind,reason:'kind missing from the frozen poses'});continue;}", 'if(!held){continue;}'),
 ('frozen poses tolerate a metre', C, 'export function frozenPoseDrift(frozen,plans,{tol=1e-6}={}) {', 'export function frozenPoseDrift(frozen,plans,{tol=1}={}) {'),
 ('frozen poses need no manifest schema', C, "document.schema!=='kx-catalogue-manifest/1'||", ''),
 ('frozen poses need no rubric', C, 'document?.rubric!==CATALOGUE.rubric||', ''),
 ('capture runs on poses that drifted', C, 'if(drifts.length)throw new Error(`refusing to capture', 'if(false)throw new Error(`refusing to capture'),
 ('catalogue argv accepts an unknown option', C, 'if(!CATALOGUE_FLAGS.includes(name))throw', 'if(false)throw'),
 ('catalogue argv accepts a repeated option', C, 'if(options.has(name))throw', 'if(false)throw'),
 ('catalogue argv takes a flag as a value', C, "value===undefined||value===''||CATALOGUE_FLAGS.includes(value)", "value===undefined||value===''"),
 ('catalogue argv timeout has no cap', C, 'seconds>CATALOGUE_TIMEOUT_S.max', 'seconds>1e9'),
 ('catalogue argv default timeout is 15 minutes', C, '{default:1800,max:3600}', '{default:900,max:3600}'),
 ('catalogue argv keeps the order it was given', C, 'return allowed.filter(item=>items.includes(item));', 'return items;'),
 ('catalogue argv accepts a repeated item', C, 'if(items.indexOf(item)!==items.lastIndexOf(item))throw', 'if(false)throw'),
 ('catalogue argv accepts any mode', C, "if(options.get('--mode')!=='catalogue')throw new Error('--mode must be catalogue');", ''),
 ('catalogue argv needs no output directory', C, "for(const name of ['--dist','--out'])if(!options.has(name))throw", "for(const name of ['--dist'])if(!options.has(name))throw"),
 ('host info trims the status columns', C, ".trimEnd();}catch{return null;}};", ".trim();}catch{return null;}};"),
 ('host info never reports a dirty tree', C, 'dirty:status===null?null:status.length>0', 'dirty:false'),
 ('host info lists 30 dirty paths', C, r"status.split('\n').filter(Boolean).slice(0,20)", r"status.split('\n').filter(Boolean).slice(0,30)"),
 ('build hash lets the main asset escape dist', C, "if(!file.startsWith(dist+path.sep))throw new Error('main asset escapes dist');", ''),
 ('build hash of the main asset is the page hash', C, 'mainAssetSha256:sha256(await readFile(file))', 'mainAssetSha256:sha256(index)'),
 ('pixel diff counts a change of exactly the threshold', C, 'Math.abs(a.pixels[i]-b.pixels[i])>threshold', 'Math.abs(a.pixels[i]-b.pixels[i])>=threshold'),
 ('pixel diff ignores the green channel', C, 'Math.abs(a.pixels[i+1]-b.pixels[i+1])>threshold||', ''),
 ('pixel diff ignores the blue channel', C, '||Math.abs(a.pixels[i+2]-b.pixels[i+2])>threshold)', ')'),
 ('pixel threshold is 40 levels', C, 'export function pixelDiff(shot,baseline,{threshold=10}={}) {', 'export function pixelDiff(shot,baseline,{threshold=40}={}) {'),
 ('sample hits ignore the pixel above and to the left', C, 'for(let dy=-1;dy<=1&&!found;dy++)', 'for(let dy=0;dy<=1&&!found;dy++)'),
 ('an empty picture is accepted', C, '{minChanged=30,', '{minChanged=0,'),
 ('a picture of the wrong surface is accepted', C, 'minHitRate=.5', 'minHitRate=0'),
 ('a whole-car view may fill the width', C, 'limit=CATALOGUE.fitFraction*w+tolerancePx;', 'limit=w;'),
 ('a whole-car view may touch the frame edge', C, 'if(Math.min(subject.marginLeftPx,subject.marginRightPx)<', 'if(false&&Math.min(subject.marginLeftPx,subject.marginRightPx)<'),
 ('a view that fails its check is photographed anyway', C, 'if(!inspection?.clear){results.push(', 'if(false){results.push('),
 ('a view the model cannot show is checked in the page', C, "if(view.status!=='OK'){results.push(", "if(false){results.push("),
 ('a missing page capability is not noticed', C, 'const missing=unavailable(view);', 'const missing=null;'),
 ('a picture that fails its pixel check is published', C, 'if(!verdict.ok){results.push(', 'if(false){results.push('),
 ('the deadline is not checked between views', C, 'for(const view of views) {\n    check();', 'for(const view of views) {\n    '),
 ('sidecar pose is the target', C, 'pose:{trainLocal:{eye:view.eye,', 'pose:{trainLocal:{eye:view.target,'),
 ('sidecar costs are swapped', C, 'costs:{trainStatic:live.costs,rendererInfo:live.info}', 'costs:{trainStatic:live.info,rendererInfo:live.costs}'),
 ('manifest entry loses its blocker', C, 'blocker:result.blocker??null,', 'blocker:null,'),
 ('manifest entry freezes no pose', C, 'plan:poseOf(view)', 'plan:{}'),
 ('in-page driver leaves the page title and credit on the picture', C, "for(const d of dom)d.el.style.display='none';", ''),
 ('in-page driver leaves the scenery hidden', C, 'for(const o of s.hidden)o.visible=true;', ''),
 ('in-page driver leaves its label on the page', C, "document.getElementById('capture-train-label')?.remove();", ''),
 ('in-page driver allows two specimens', C, "if(cat.state)throw new Error('a specimen is already on stage');", ''),
 ('in-page driver ignores a page that moved the camera', C, 'if(moved>1e-6)throw new Error(', 'if(false)throw new Error('),
 ('in-page driver runs a lamp view with no lamp switch', C, "if(typeof k.setTrainLampState!=='function')throw", 'if(false)throw'),
 ('in-page driver isolates every car', C, "o.visible=s.saved[i]&&o.name==='car-'+n;", 'o.visible=s.saved[i];'),
 ('in-page driver leaves the specimen cut to one car', C, "if(mode==='all'){g.visible=true;g.children.forEach((o,i)=>{o.visible=s.saved[i];});}", "if(mode==='all'){g.visible=true;}"),
 ('catalogue output may be the scratch directory itself', C, '||out===scratch)throw new Error', ')throw new Error'),
 ('catalogue preflight never says poses are frozen', C, 'posesFrozen:!!frozen,planned:counts', 'posesFrozen:false,planned:counts'),
 ('formation doors of the rear cab car count from its start', C, "const base=car.cab==='rear'?car.end:car.start,dir=car.cab==='rear'?-1:1;", 'const base=car.start,dir=1;'),
 ('formation roof is the crown, not the cover top', C, 'const roofTop=body.crown+body.coverHeight;', 'const roofTop=body.crown;'),
 ('every capture mode may use a software renderer', C, "'--use-angle=metal',", "'--use-angle=swiftshader',"),
]
def run(work):
    return kxmut.run_process(['node','--test','--test-reporter=tap','--test-timeout=20000','tools/tests/train-capture.test.mjs','tools/tests/train-capture-schedule.test.mjs','tools/tests/train-framing.test.mjs','tools/tests/portal-entry.test.mjs','tools/tests/train-views.test.mjs'], cwd=work, timeout=30)
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
    selected=[m for m in M if only is None or only in m[0]]
    if not selected:raise SystemExit('no mutant label contains: '+str(only))
    for label,target,old,new in selected:
        file=work/target;original=file.read_text()
        if old not in original:raise SystemExit('missing mutation pattern: '+label)
        file.write_text(original.replace(old,new,1))
        try:result=run(work)
        except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap: not a kill
            file.write_text(original);survivors.append(label);print(f'[SURVIVED] {label} ({kxmut.why(error)}; that is not a kill)',flush=True);continue
        file.write_text(original)
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
    print(f'{len(selected)-len(survivors)}/{len(selected)} caught; survivors: {survivors}')
    print(f'{len(names&seen)}/{len(names)} tests observed failing; never failed: {sorted(names-seen)}')
    raise SystemExit(1 if survivors or (names-seen and only is None) else 0)

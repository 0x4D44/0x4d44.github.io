// GPU rubric evidence, from the exact frozen inputs of axis05-evidence. Import-safe preflight.
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {createServer} from 'node:http';
import {readFile,writeFile,realpath,mkdir,mkdtemp,stat,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync,crc32} from 'node:zlib';
import {manualFrames,cdpPipe} from './signal-capture.mjs';
import {createCaptureLifetime,cleanupCaptureBrowser} from './capture-runtime.mjs';
import {pinParameters,scenePinFrom} from './scene-pin.mjs';
import {ALL_KINDS,FIGURES,EMU_FIGURES,trainLayout} from '../core/train.ts';
import {END_GAP,bodySpec,carPlan} from '../web/src/train.ts';
import {EDINBURGH_FLEET} from '../web/src/edinburgh-fleet.ts';
import {shedLayout,shedBufferStops,standingTrainPose,stationPlatforms,platformFormationLimits,platformSouthEnd,pointInPolygon,worldToShed} from '../core/station.ts';
import {PLATFORM_HEIGHT} from '../core/scene.ts';
import {readPng} from './axis01-pixels.mjs';
import {ALTERNATE_RULE,ASKABLE_VIEW_IDS,CATALOGUE,CURVE,CURVE_NORMAL,CURVE_NORMAL_VIEWS,CURVE_RULE,CURVE_STAGE,CURVE_VIEWS,MOTION,MOTION_RULE,MOTION_STAGE,MOTION_STATION_NOTE,STAGE_VIEWS,STATION_ORIENTATIONS,VIEW_IDS,cumulative,curvePoseOf,curveRouteFor,curveVerdict,failureSummary,frameTransform,frozenEntryOf,judgeCurvePage,judgeMotionClip,judgeMotionFrame,localPose,motionPoseOf,alternatePlacementsFor,alternateViewsFromSearch,findPlacement,planCatalogueViews,planCurve,planMotion,planStation,poseOf,poseDifference,pointAlong,reseatBlockedStationViews,segmentAt,stationFrozenDrift,stationViewsFromFrozen,stationViewsFromSearch,typicalRadius,viewForExposure} from './train-framing.mjs';
import {tunnelMouths} from '../core/landmarks.ts';
import {buildGraph,edgePoint} from '../core/graph.ts';
import {shapeFrom} from '../core/curves.ts';
import {createMotion,DEFAULT_BUFFER_CLEARANCE_M} from '../core/motion.ts';
import {carPoses,createTrainKinds} from '../web/src/trains-live.ts';
import {createReplayFeed,parseRecording} from '../web/src/feed.ts';
import {matchService,validDate} from '../core/schedule.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const isInside=(directory,file)=>{const r=path.relative(directory,file);return !!r&&r!=='..'&&!r.startsWith(`..${path.sep}`)&&!path.isAbsolute(r);};

export async function frozenBytes(entry) {
  if(!entry?.capturedPath||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('missing frozen input fingerprint');
  const bytes=await readFile(entry.capturedPath);
  if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('frozen input hash mismatch');
  return bytes;
}
async function frozenScheduleBytes(entry) {
  if(!entry?.capturedPath||!path.isAbsolute(entry.capturedPath)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0)
    throw new Error('invalid frozen schedule fingerprint');
  const scratch=path.join(ROOT,'.scratch'),scratchInfo=await lstat(scratch);
  if(!scratchInfo.isDirectory()||scratchInfo.isSymbolicLink())throw new Error('frozen schedule scratch must be a private directory');
  const privateRoot=await realpath(scratch),capturedPath=path.resolve(entry.capturedPath);
  if(!isInside(privateRoot,capturedPath))throw new Error('frozen schedule must stay inside private .scratch');
  const info=await lstat(capturedPath);
  if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw new Error('frozen schedule must be a regular private file');
  if(!isInside(privateRoot,await realpath(capturedPath)))throw new Error('frozen schedule symlink escapes .scratch');
  const bytes=await frozenBytes(entry);
  if(entry.bytes!==bytes.length)throw new Error('frozen schedule byte count mismatch');
  return bytes;
}
export async function frozenSchedulePolicy(entries=[]) {
  if(!Array.isArray(entries))throw new Error('invalid frozen schedule manifest');
  const schedules=new Map();
  for(const entry of entries) {
    if(!entry||!validDate(entry.date)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||schedules.has(entry.date))throw new Error('invalid or duplicate frozen schedule input');
    let document;
    try{document=JSON.parse((await frozenScheduleBytes(entry)).toString('utf8'));}catch(error){throw new Error(`invalid frozen schedule ${entry.date}: ${error.message}`);}
    if(!document||document.date!==entry.date||document.dates!==undefined||!Array.isArray(document.calls)||document.calls.length>10000)
      throw new Error(`invalid frozen schedule document for ${entry.date}`);
    for(const call of document.calls)if(!call||typeof call!=='object'||call.date!==entry.date||!validDate(call.serviceDate)||
      !['uid','headcode','operator','origin','destination'].every(key=>typeof call[key]==='string')||
      call.platform!==null&&typeof call.platform!=='string'||
      ![call.arrivalMs,call.departureMs].every(value=>value===null||typeof value==='number'&&Number.isFinite(value)))
      throw new Error(`invalid frozen schedule call for ${entry.date}`);
    schedules.set(entry.date,{date:entry.date,calls:document.calls});
  }
  return {dates:[...schedules.keys()].sort(),schedules,serviceFor(description,atTime){
    if(!Number.isFinite(atTime))return undefined;
    const calls=schedules.get(new Date(atTime).toISOString().slice(0,10))?.calls;
    return calls?matchService(description,atTime,calls):undefined;
  }};
}
/** Causal replay only: find a physical leading end crossing the drawn south face. */
export function portalCapturePlan(recordings,data,anchors,serviceFor=()=>undefined) {
  const mouth=tunnelMouths(data).find(m=>m.id==='gasworks-south');
  if(!mouth)throw new Error('Gasworks south mouth missing');
  const face={...mouth,origin:mouth.origin.map((v,i)=>v+mouth.axis[i]*1.2)};
  const along=p=>(p[0]-face.origin[0])*face.axis[0]+(p[1]-face.origin[1])*face.axis[1];
  const graph=buildGraph(data);
  for(const [recordingIndex,rows] of recordings.entries()) {
    const kinds=createTrainKinds(serviceFor),motion=createMotion(graph,anchors,{lengthM:kinds.lengthM,
      wayMaxspeed:new Map(data.rails.filter(r=>r.maxspeed!==undefined).map(r=>[r.id,r.maxspeed]))});
    const feed=createReplayFeed(rows,1,{advance:s=>motion.advance(s),apply:(e,t)=>motion.apply(e,t)},()=>{}),history=new Map();
    const start=rows[0]?.t,end=rows.at(-1)?.t;
    try {for(let timeMs=start;timeMs<=end;timeMs+=500) {
      if(timeMs>start)feed.advance(.5);
      for(const t of motion.trains()) {
        const w=along(t.leading.point),u=(t.leading.point[0]-face.origin[0])*face.across[0]+(t.leading.point[1]-face.origin[1])*face.across[1];
        if(!history.has(t.id)&&(w < -35 || w > 15 || Math.abs(u)>mouth.halfWidth+2))continue;
        if(w < -35 || w > t.lengthM+20){history.delete(t.id);continue;}
        const h=history.get(t.id)??[];history.set(t.id,h);
        h.push({timeMs,description:t.description,point:[...t.leading.point],speedMps:t.speed,state:t.state,lengthM:t.lengthM,reversals:t.reversals,
          occupied:t.occupied.map(s=>({a:s.edge.a,b:s.edge.b,fromT:s.fromT,toT:s.toT,edgeLengthM:s.edge.length})),alongM:w});
        const frames=selectPortalFrames(h);
        if(frames) {
          const crossing=h.reduce((a,b)=>Math.abs(a.alongM)<Math.abs(b.alongM)?a:b);
          const lateral=(crossing.point[0]-face.origin[0])*face.across[0]+(crossing.point[1]-face.origin[1])*face.across[1];
          const bore=mouth.bores.reduce((a,b)=>Math.abs(a.lateral-lateral)<Math.abs(b.lateral-lateral)?a:b);
          // Reproduce the browser's direct first seek and subsequent frame deltas exactly.
          const canonicalKinds=createTrainKinds(serviceFor),canonical=createMotion(graph,anchors,{lengthM:canonicalKinds.lengthM,
            wayMaxspeed:new Map(data.rails.filter(r=>r.maxspeed!==undefined).map(r=>[r.id,r.maxspeed]))});
          const replay=createReplayFeed(rows,1,{advance:s=>canonical.advance(s),apply:(e,at)=>canonical.apply(e,at)},()=>{});
          let previous=start;
          try {for(const frame of frames) {
            replay.advance((frame.timeMs-previous)/1000);previous=frame.timeMs;
            const actual=canonical.trains().find(v=>v.id===t.id);if(!actual)throw new Error('portal train absent on direct replay seek');
            Object.assign(frame,{description:actual.description,point:[...actual.leading.point],speedMps:actual.speed,state:actual.state,
              lengthM:actual.lengthM,reversals:actual.reversals,alongM:along(actual.leading.point),
              occupied:actual.occupied.map(s=>({a:s.edge.a,b:s.edge.b,fromT:s.fromT,toT:s.toT,edgeLengthM:s.edge.length}))});
          }} finally {replay.dispose();}
          if(!selectPortalFrames(frames))throw new Error('portal entry changed on canonical direct replay seek');
          return {recordingIndex,trainId:t.id,description:frames.at(-1).description,kind:canonicalKinds.kindFor(t),direction:'portal-entry',startMs:frames[0].timeMs,
            movedM:frames.at(-1).alongM-frames[0].alongM,frames,portal:{...face,bore},mode:'recorded Gasworks south final-coaches entry'};
        }
      }
    }} finally {feed.dispose();}
  }
  throw new Error('no measured south portal entry in frozen recordings');
}
export function selectPortalFrames(history) {
  const lengthM=history[0]?.lengthM;
  if(!Number.isFinite(lengthM)||lengthM<=0)return null;
  // Start with the final coaches outside: a close exterior camera can see every remaining
  // exterior surface without crossing the station/city to frame the entire formation.
  const remainingM=Math.min(40,lengthM*.6);
  const targets=[lengthM-remainingM,lengthM-remainingM*.75,lengthM-remainingM*.5,lengthM-remainingM*.25,lengthM+4],frames=targets.map(w=>history.reduce((best,f)=>!best||Math.abs(f.alongM-w)<Math.abs(best.alongM-w)?f:best,undefined));
  if(frames.some((f,i)=>!f||Math.abs(f.alongM-targets[i])>3||f.speedMps<=.05||(i&&f.timeMs<=frames[i-1].timeMs)))return null;
  if(frames[0].alongM>=lengthM||frames.at(-1).alongM<=lengthM)return null;
  return frames;
}
/** A fixed exterior view must measure progressive concealment, not a train disappearing outside. */
export function verifyPortalSequence(frames) {
  if(frames.length<3)throw new Error('portal entry needs at least three measured frames');
  const first=frames[0],camera=first.camera;
  if(!camera||!first.visibility?.track?.visible||!first.visibility.track.rendered)
    throw new Error('portal entry starts without rendered track continuing inside its aperture');
  const sameCamera=c=>c&&c.fov===camera.fov&&['position','target'].every(k=>c[k]?.length===3&&camera[k]?.length===3&&c[k].every((v,i)=>Number.isFinite(v)&&Math.abs(v-camera[k][i])<=1e-6));
  for(const [i,frame] of frames.entries()) {
    const length=frame.visibility?.visibleLengthM;
    if(!frame.visibility?.clear||!Number.isFinite(length)||length<0||!sameCamera(frame.camera)||
      (i&&(frame.timeMs<=frames[i-1].timeMs||frames[i-1].visibility.visibleLengthM-length<=.5)))
      throw Object.assign(new Error('portal entry did not progressively disappear into the bore from a fixed camera'),{details:{frame:i,measurement:frame}});
  }
  if(first.visibility.visibleLengthM<4)throw new Error('portal entry starts with no measurable train');
  return {initialVisibleLengthM:first.visibility.visibleLengthM,finalVisibleLengthM:frames.at(-1).visibility.visibleLengthM,
    decreaseM:first.visibility.visibleLengthM-frames.at(-1).visibility.visibleLengthM,frames:frames.length,method:'camera-facing coach surface rays, weighted by longitudinal bins along the portal axis'};
}
/** Buffer candidate images until the complete entry passes, so a failed camera never publishes partial evidence. */
export async function capturePortalFrames(plan,{seek,inspect,picture,publish,check=()=>{}}) {
  const attempts=[];
  for(let candidate=0;candidate<6;candidate++) {
    const frames=[],pictures=[];let camera,validation;
    try {
      for(const expected of plan.frames) {
        check();await seek(expected);
        const actual=await inspect(expected,candidate,camera);
        if(actual.visibility?.clear===false) {
          const v=actual.visibility,hit=v.occluder;
          throw Object.assign(new Error(`${v.reason}${v.blocker?' by '+v.blocker:''}${hit?' at '+hit.distanceM.toFixed(3)+' m (body '+hit.targetDistanceM.toFixed(3)+' m)':''}`),
            {details:{visibility:v,camera:actual.camera,expected,actual}});
        }
        verifyReplayFrame(plan,expected,actual);camera??=actual.camera;
        frames.push({...actual,candidate});pictures.push(await picture(expected,actual));
      }
      validation=verifyPortalSequence(frames);
    } catch(error) {
      const visibility=error.details?.visibility??error.details?.actual?.visibility;
      attempts.push({candidate,reason:error.message,blocker:visibility?.blocker??null,occluder:visibility?.occluder??null,details:error.details??null});continue;
    }
    const files=[];
    for(let i=0;i<frames.length;i++)files.push(await publish(plan.frames[i],frames[i],pictures[i]));
    return {...plan,frames,files,attempts,validation};
  }
  throw Object.assign(new Error('no valid fixed-camera portal entry'),{details:attempts});
}
export function capturePlans(report) {
  if(report?.portalMode){const p=report.captureCandidates[0];if(!p?.portal||!selectPortalFrames(p.frames))throw new Error('invalid portal sequence');return {requirements:[`${p.recordingIndex}-${p.direction}`],plans:[p]};}
  if(!report?.recordings?.length||!report.reproducibility?.inputHashes)throw new Error('invalid Axis 05 evidence pack');
  const requirements=report.recordings.flatMap(r=>['arrival','departure'].map(d=>`${r.index}-${d}`));
  const plans=report.captureCandidates.filter(c=>report.recordings.some(r=>r.index===c.recordingIndex)&&c.frames?.length>=3&&c.kind&&
    c.frames.every((f,i)=>Number.isFinite(f.timeMs)&&f.point?.length===2&&f.occupied?.length&&(!i||f.timeMs>c.frames[i-1].timeMs))&&
    c.frames.some(f=>f.state==='held'&&f.speedMps<.05)&&c.frames.some(f=>f.speedMps>.05)&&c.movedM>=1);
  const missing=requirements.filter(key=>!plans.some(p=>`${p.recordingIndex}-${p.direction}`===key));
  if(missing.length)throw new Error(`no measured sequence candidates for ${missing.join(', ')}`);
  return {requirements,plans};
}
/** Independent failures retain their reason, then another real candidate is tried. */
export async function captureSequences(report, capture,check=()=>{}) {
  const {requirements,plans}=capturePlans(report),shots=[],failed=[];
  for(const requirement of requirements) {
    // Prefer long platforms; a fallback long train on a short platform is not formation evidence.
    const alternatives=plans.filter(p=>`${p.recordingIndex}-${p.direction}`===requirement).sort((a,b)=>
      Number(+a.platform>=9)-Number(+b.platform>=9)||a.startMs-b.startMs);
    for(const plan of alternatives.slice(0,6)) {
      check();
      try { shots.push(await capture(plan));break; }
      catch(error){failed.push({requirement,trainId:plan.trainId,timeMs:plan.startMs,reason:error.message,details:error.details??null});}
    }
  }
  const missing=requirements.filter(key=>!shots.some(s=>`${s.recordingIndex}-${s.direction}`===key));
  return {shots,failed,missing,exitCode:missing.length?1:0};
}
export function verifyReplayFrame(plan, expected, actual) {
  const bodyMatches=actual?.occupied?.length===expected.occupied.length&&expected.occupied.every((e,i)=>{
    const a=actual.occupied[i];return a.a===e.a&&a.b===e.b&&Number.isFinite(a.edgeLengthM)&&a.edgeLengthM>0&&
      Math.abs(a.fromT-e.fromT)*a.edgeLengthM<=.05&&Math.abs(a.toT-e.toT)*a.edgeLengthM<=.05;
  });
  if(!actual||actual.id!==plan.trainId||actual.kind!==plan.kind||actual.timeMs!==expected.timeMs||!actual.rendered||
    actual.description!==(expected.description??plan.description)||Math.hypot(actual.point[0]-expected.point[0],actual.point[1]-expected.point[1])>.05||
    Math.abs(actual.lengthM-expected.lengthM)>1e-6||Math.abs(actual.speedMps-expected.speedMps)>.02||
    actual.state!==expected.state||actual.reversals!==expected.reversals||!bodyMatches||!actual.visibility?.clear)
    throw Object.assign(new Error('drawn replay train, clock, body or clear camera disagrees with audited frame'),{details:{expected,actual}});
  return true;
}
export function frozenTrainEndpoint(url, frozen) {
  const u=new URL(url,'http://127.0.0.1');
  if(u.pathname==='/relay/health')return {type:'application/json',body:'{"ok":true,"mode":"frozen-capture"}'};
  if(u.pathname==='/relay/anchors')return {type:'application/json',body:frozen.anchors};
  if(u.pathname==='/relay/recording')return {type:'application/x-ndjson',body:frozen.recording};
  if(u.pathname==='/relay/sclass'&&frozen.table)return {type:'application/json',body:frozen.table};
  if(u.pathname==='/relay/schedule'){
    const schedule=frozen.schedules?.get(u.searchParams.get('date'));
    if(schedule)return {type:'application/json',body:JSON.stringify(schedule)};
  }
  // Missing dates retain the audit's fallback policy; never query the growing live relay.
  if(u.pathname.startsWith('/relay/'))return {status:404,type:'application/json',body:'{"error":"not in frozen train pack"}'};
}
/** CDP exception descriptions discard custom Error fields. Return plain failure data
 * from the page, then construct the error here so every blocked ray is retained. */
export function checkedCaptureView(value) {
  if(value?.failure)throw Object.assign(new Error(value.failure.message),{details:value.failure.details??null});
  return value;
}
export function replayUrl(origin,startMs) {
  const date=new Date(startMs).toISOString().slice(0,10).replaceAll('-','');
  return `${origin}/kings-cross/?trains=replay&date=${date}&speed=1&board=0&tooltip=0`;
}
/** One forward pass per recording; camera changes and catalogue kinds do not restart replay. */
export function replaySession(load,seek) {
  let index,session,time=-Infinity;
  return {async at(recordingIndex,atMs){
    let loaded=false;if(index!==recordingIndex||atMs<time){session=await load(recordingIndex);index=recordingIndex;time=session.start;loaded=true;}
    if(atMs<session.start)throw new Error('capture before recording start');
    if(atMs!==time)await seek(atMs-session.start,atMs);
    time=atMs;return {...session,loaded};
  }};
}
export async function measuredPhase(timings,phase,work,now=()=>performance.now()) {
  const start=now();try{return await work();}finally{timings.push({phase,elapsedMs:now()-start});}
}
/** The audit candidate stores its terminal headcode. Earlier frames may precede a real rename.
 * Learn each frame's expected description on the same causal replay, never from that future label. */
export function describeCaptureFrames(report,recordings,data,anchors,serviceFor=()=>undefined) {
  const candidates=structuredClone(report.captureCandidates),graph=buildGraph(data);
  for(const [index,rows] of recordings.entries()) {
    const kinds=createTrainKinds(serviceFor),motion=createMotion(graph,anchors,{lengthM:kinds.lengthM,
      wayMaxspeed:new Map(data.rails.filter(r=>r.maxspeed!==undefined).map(r=>[r.id,r.maxspeed]))});
    const feed=createReplayFeed(rows,1,{advance:s=>motion.advance(s),apply:(e,t)=>motion.apply(e,t)},()=>{});
    const targets=candidates.filter(p=>p.recordingIndex===index).flatMap(p=>p.frames.map(frame=>({frame,id:p.trainId}))).sort((a,b)=>a.frame.timeMs-b.frame.timeMs);
    let time=rows[0]?.t??0;
    for(const target of targets){feed.advance((target.frame.timeMs-time)/1000);time=target.frame.timeMs;
      const train=motion.trains().find(t=>t.id===target.id);if(!train)throw new Error('audited train absent at its capture time');target.frame.description=train.description;
    }
    feed.dispose();
  }
  return {...report,captureCandidates:candidates};
}
/** Stage catalogue specimens only on long, surface OSM rail segments outside platform polygons. */
export function catalogueTracks(graph, lengthM) {
  const nodes=new Map(graph.nodes.map(n=>[n[0],n.slice(1)])),tracks=[];
  const nearPlatform=p=>graph.platforms.some(poly=>{
    const points=poly.pts??[];if(!points.length)return false;
    return p[0]>=Math.min(...points.map(q=>q[0]))-2&&p[0]<=Math.max(...points.map(q=>q[0]))+2&&
      p[1]>=Math.min(...points.map(q=>q[1]))-2&&p[1]<=Math.max(...points.map(q=>q[1]))+2;
  });
  for(const rail of graph.rails)if(!rail.tunnel)for(let i=1;i<rail.nodes.length;i++) {
    const a=nodes.get(rail.nodes[i-1]),b=nodes.get(rail.nodes[i]);if(!a||!b)continue;
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    if(length<lengthM+2||nearPlatform(mid)||nearPlatform(a)||nearPlatform(b))continue;
    const back=[(b[0]-a[0])/length,(b[1]-a[1])/length];
    tracks.push({rail:rail.id,edge:[rail.nodes[i-1],rail.nodes[i]],point:[mid[0]-back[0]*lengthM/2,mid[1]-back[1]*lengthM/2],rotationY:Math.atan2(back[0],back[1]),distanceM:length,
      reason:'OSM surface rail segment, coach fits between its nodes, outside platform polygon envelopes; catalogue specimen, not a recorded service'});
  }
  return tracks.sort((a,b)=>Math.hypot(...a.point)-Math.hypot(...b.point));
}
export function corridorPoints(plan,graph,anchors) {
  const nodes=new Map(graph.nodes.map(n=>[n[0],n.slice(1)])),points=[];
  for(const f of plan.frames)for(const s of f.occupied)for(const t of [s.fromT,s.toT]) {
    const a=nodes.get(s.a),b=nodes.get(s.b);if(!a||!b)throw new Error('candidate occupied edge not in frozen graph');
    points.push([a[0]+(b[0]-a[0])*t,1.5,a[1]+(b[1]-a[1])*t]);
  }
  const stop=anchors.anchors.find(a=>a.platform===plan.platform&&a.kind==='platform');
  if(stop)points.push([stop.point[0],1,stop.point[1]]);
  return points;
}
// =====================================================================================================
// CATALOGUE MODE (rubric-FROZEN-v1). `--mode catalogue` photographs every train kind from the rubric's required views
// V01-V10 on the real GPU. No replay, no recording: the kinds are built with the page's own evidenceBuildTrain hook and
// shown on a neutral specimen stage (V01-V09) or standing at a real platform buffer stop (V10). Poses are frozen numbers,
// derived once from the formation; a view that cannot be shown is a GAP with its reason, never a different pose.
// =====================================================================================================
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const basisOf=list=>[...new Set(list)].join('+');
/** The one Chrome command line every capture mode uses: headless, pipe-driven, on the real Metal GPU (never a software renderer). */
export const chromeArgs=profile=>['--headless=new','--remote-debugging-pipe',`--user-data-dir=${profile}`,'--no-sandbox','--no-first-run','--no-default-browser-check','--disable-breakpad','--disable-crash-reporter','--noerrdialogs','--use-mock-keychain','--password-store=basic','--no-proxy-server','--ignore-gpu-blocklist','--use-angle=metal','--enable-gpu-rasterization','about:blank'];
/**
 * Which class a picture of an LNER kind is. The Class 800 (bi-mode) and 801 (electric) share the AT300 car shape and the car codes of each formation (core/train.ts `classes`). The model
 * draws one pattern: a pantograph on each driving car, a plain underframe and no diesel engine under any car. That is the electric 801, so the pack states it as the 801 (lner5 the 801/1,
 * lner9 the 801/2) and names the bi-mode 800 of the same formation (800/2, 800/1) as what it does not draw. The other kinds stand for one class (or one class family) and carry no note.
 */
const lnerNote=(electric,cars,bimode)=>`stated class: the electric Class ${electric} (${cars}). The bi-mode Class ${bimode} has the same body shape and car pattern but carries diesel engines under its cars; the model draws none (a plain underframe, one roof and pantograph pattern), so it is stated as the 801 and is not claimed to match the 800`;
export const CLASS_NOTES=Object.freeze({lner5:lnerNote('801/1','five cars','800/2'),lner9:lnerNote('801/2','nine cars','800/1')});
/**
 * The Waverley kinds the catalogue can photograph: every web/src/edinburgh-fleet.ts row that carries a `formation`. Adding a row is all a
 * family needs: its formation stands in for describeFormation, and the page builds it through window.__kx.evidenceBuildEdinburgh.
 */
export const EDINBURGH_CAPTURE_KINDS=Object.freeze(EDINBURGH_FLEET.filter(row=>row.formation).map(row=>row.kind));
/** Run once on the page when a run takes a Waverley kind: every specimen build then tries the Edinburgh table first, then the King's Cross builder. */
export const EDINBURGH_BUILD_HOOK=`(()=>{const k=window.__kx;if(typeof k.evidenceBuildEdinburgh!=='function')throw new Error('page has no evidenceBuildEdinburgh hook');if(k.__edinburghBuild)return true;const kx=k.evidenceBuildTrain;k.evidenceBuildTrain=kind=>k.evidenceBuildEdinburgh(kind)??kx(kind);k.__edinburghBuild=true;return true;})()`;
/** A Waverley row's own description, checked for the fields the view planner reads. */
export function describeEdinburghFormation(kind,rows=EDINBURGH_FLEET) {
  const row=rows.find(r=>r.kind===kind&&r.formation);
  if(!row)throw new Error(`no Edinburgh capture formation for ${kind}`);
  const f=row.formation(),finite=v=>typeof v==='number'&&Number.isFinite(v);
  if(![f.length,f.half,f.crown,f.coverHeight,f.roofTop,f.doorWidth].every(finite)||!Array.isArray(f.cars)||!f.cars.length)throw new Error(`${kind}: formation needs length, half, crown, coverHeight, roofTop, doorWidth and cars`);
  if(Math.abs(f.cars.at(-1).end-f.length)>1e-6||f.cars.some((c,i)=>c.index!==i||!(c.end>c.start)||c.bogies.length!==2||c.motor.length!==2||!Array.isArray(c.doors)))throw new Error(`${kind}: formation cars are not a continuous indexed train`);
  for(const name of ['lengthM','widthM','roofTopM'])if(!finite(f.dimensions?.[name]?.value)||typeof f.dimensions[name].basis!=='string')throw new Error(`${kind}: formation dimensions.${name} needs a value and a basis`);
  return {kind,...f,classNote:[f.classNote,EDINBURGH_V10_NOTE].filter(Boolean).join('. ')};
}
/** Lead ruling 2026-11-10: until a Waverley V10 exists, a Waverley kind's V10 stands at a King's Cross buffer stop, and every sidecar says so. */
export const EDINBURGH_V10_NOTE='V10 PROVISIONAL: a Waverley kind is stood at a King\'s Cross buffer stop for the station views, not at a Waverley platform';
/** The formation block of a manifest entry: the family, the classes and the note on them, the length, the dimensions and the cars. */
export const manifestFormation=formation=>({family:formation.family,classes:formation.classes,classNote:formation.classNote,lengthM:formation.length,dimensions:formation.dimensions,cars:formation.cars});
/** A plain description of one kind's formation: the input of planCatalogueViews and the sidecars' `formation`/`dimensions`. */
export function describeFormation(kind) {
  if(EDINBURGH_CAPTURE_KINDS.includes(kind))return describeEdinburghFormation(kind);
  const layout=trainLayout(kind),family=layout.spec.family,body=bodySpec(family),figures=family==='at300'?FIGURES:EMU_FIGURES[family];
  const cars=layout.cars.map(car=>{
    // doors are metres from the cab end of a cab car (the rear cab car counts back from its end) or from the car's start (web/src/train.ts buildCar)
    const base=car.cab==='rear'?car.end:car.start,dir=car.cab==='rear'?-1:1;
    return {index:car.index,type:car.type,length:car.length,start:car.start,end:car.end,cab:car.cab,bogies:[...car.bogies],motor:[...car.motor],
      pantograph:car.pantograph?[...car.pantograph]:null,doors:carPlan(car,family).doors.map(s=>base+dir*s)};
  });
  const roofTop=body.crown+body.coverHeight;
  const lengthFigures=[...new Set(layout.cars.map(c=>family==='at300'?(c.cab?'drivingCarLength':'intermediateCarLength'):(c.cab&&figures.drivingCarLength?'drivingCarLength':'carLength')))];
  const roofFigures=family==='at300'?['roofEdgeHeight','roofCoverHeight']:['height'];
  return {kind,family,classes:layout.spec.classes,classNote:Object.hasOwn(CLASS_NOTES,kind)?CLASS_NOTES[kind]:null,length:layout.length,half:body.half,crown:body.crown,coverHeight:body.coverHeight,roofTop,doorWidth:body.doorWidth,cars,
    dimensions:{
      lengthM:{value:layout.length,basis:basisOf(lengthFigures.map(n=>figures[n].basis)),figures:lengthFigures.map(n=>`${family==='at300'?'FIGURES':`EMU_FIGURES.${family}`}.${n}`)},
      widthM:{value:2*body.half,basis:figures.bodyWidth.basis,figures:[`${family==='at300'?'FIGURES':`EMU_FIGURES.${family}`}.bodyWidth`],figureM:figures.bodyWidth.value},
      roofTopM:{value:roofTop,basis:basisOf(roofFigures.map(n=>figures[n].basis)),figures:roofFigures.map(n=>`${family==='at300'?'FIGURES':`EMU_FIGURES.${family}`}.${n}`),
        figureM:family==='at300'?FIGURES.roofEdgeHeight.value+FIGURES.roofCoverHeight.value:figures.height.value}},
  };
}

/**
 * The real station's numbers for V10, read from the file the page is built from: the shed's heading, its buffer stops from west to east, and the
 * outline of every surface platform. `inside` and `standing` are core/station.ts pointInPolygon and standingTrainPose, which planStation calls.
 * `stopInfo` has, for each stop, where it is across the shed (`u`), the platform the page matches it to (web/src/main.ts: the one whose south end is nearest it across the shed, which is how
 * the page names its sample trains' platforms) and that platform's formation limit (core/station.ts platformFormationLimits with the page's stop clearance, as web/src/trains-live.ts
 * reads it): the stops a train may move to (ALTERNATE_RULE).
 */
export async function loadStationScene(file=fileURLToPath(new URL('../web/src/data/kx-track.json',import.meta.url))) {
  if(PLATFORM_HEIGHT!==CATALOGUE.platformHeightM)throw new Error(`the page's platform height is ${PLATFORM_HEIGHT} m but the catalogue says ${CATALOGUE.platformHeightM} m`);
  const bytes=await readFile(file),data=JSON.parse(bytes.toString('utf8')),layout=shedLayout(data);
  const stops=shedBufferStops(data,layout).sort((p,q)=>worldToShed(layout,[p.x,p.z]).u-worldToShed(layout,[q.x,q.z]).u);
  const surface=stationPlatforms(data),limits=platformFormationLimits(data,DEFAULT_BUFFER_CLEARANCE_M);
  const stopInfo=stops.map((stop,index)=>{
    const {u}=worldToShed(layout,[stop.x,stop.z]);
    const platform=[...surface].sort(([,p],[,q])=>Math.abs(worldToShed(layout,platformSouthEnd(p.pts)).u-u)-Math.abs(worldToShed(layout,platformSouthEnd(q.pts)).u-u))[0]?.[0]??null;
    return {index,id:stop.id,u,platform,limitM:limits.get(platform)??null};
  });
  return {heading:layout.heading,stops,stopInfo,platforms:[...surface].map(([ref,p])=>({ref,pts:p.pts})),inside:pointInPolygon,
    standing:stop=>standingTrainPose(layout,stop,CATALOGUE.noseToStopM),file,sha256:sha256(bytes)};
}
/** What every V10 view of a run shares, for the manifest: the data it was placed from and the search limits. */
export function stationManifest(scene) {
  return {trackData:{file:'kings-cross-src/web/src/data/kx-track.json',sha256:scene.sha256},heading:scene.heading,stopIndex:CATALOGUE.stationStopIndex,stop:scene.stops[CATALOGUE.stationStopIndex]??null,
    platforms:scene.platforms.map(p=>p.ref),orientations:STATION_ORIENTATIONS,platformHeightM:PLATFORM_HEIGHT,eyeAbovePlatformM:CATALOGUE.eyeAbovePlatformM,noseToStopM:CATALOGUE.noseToStopM,
    search:{azimuthStepDeg:1,maxCandidates:CATALOGUE.stationMaxCandidates,minSeparationDeg:CATALOGUE.stationMinSeparationDeg,edgeClearM:CATALOGUE.platformEdgeClearM,frontAngleDeg:CATALOGUE.stationFrontAngleDeg,minScreenSpan:CATALOGUE.stationMinScreenSpan,passes:['spread','neighbour']},
    alternates:{rule:ALTERNATE_RULE,stopClearanceM:DEFAULT_BUFFER_CLEARANCE_M,stops:(scene.stopInfo??[]).map(({index,id,platform,limitM,u})=>({index,id,platform,limitM,acrossShedM:u}))},
    rule:'The specimen stands at one real buffer stop, nose at the buffers first, then turned so the leading cab is at the north end. For each view the cameras that lie exactly D m from the focus over a platform are tried in two passes, each best first (nearest a front three-quarter view): first the spread (none within minSeparationDeg of azimuth of another, at most maxCandidates), then every other such position, the neighbours the thinning dropped; the first whose check is clear is accepted, and a view is a GAP only when all of them were tried; the first placement with all six clear is kept, else the one with most. Poses are then frozen.'};
}

export const CATALOGUE_TIMEOUT_S={default:1800,max:3600};
const CATALOGUE_FLAGS=['--mode','--dist','--out','--kinds','--views','--chrome','--poses','--exposure','--timeout-seconds'];
/**
 * `--mode catalogue --dist <dist> --out <dir> [--kinds a,b] [--views V01,V04] [--chrome none|path] [--poses <manifest>] [--exposure day|noon|dusk] [--timeout-seconds N]`.
 * Without `--views` a run takes V01-V10; `M01` (the motion clip), `C01` (the tightest curve) and `C02` (the curve of the radius that is typical of the page's track) are opt-in, `--views M01`, `--views C01,C02` or with others, and are taken at day only.
 * A `noon` run (the page's clock pinned to midsummer noon, see EXPOSURES) takes V10 only, which is its default, and no other view.
 */
export function parseCatalogueArgs(args) {
  const options=new Map();
  for(let i=0;i<args.length;i+=2) {
    const name=args[i],value=args[i+1];
    if(!CATALOGUE_FLAGS.includes(name))throw new Error(`unknown catalogue option ${name}`);
    if(options.has(name))throw new Error(`repeated catalogue option ${name}`);
    if(value===undefined||value===''||CATALOGUE_FLAGS.includes(value))throw new Error(`missing value for ${name}`);
    options.set(name,value);
  }
  if(options.get('--mode')!=='catalogue')throw new Error('--mode must be catalogue');
  for(const name of ['--dist','--out'])if(!options.has(name))throw new Error(`missing ${name}`);
  const list=(name,allowed,taken=allowed)=>{
    if(!options.has(name))return [...taken];
    const items=options.get(name).split(',');
    for(const item of items) {
      if(!allowed.includes(item))throw new Error(`${name}: unknown ${item||'(empty)'}; expected ${allowed.join(',')}`);
      if(items.indexOf(item)!==items.lastIndexOf(item))throw new Error(`${name}: ${item} repeated`);
    }
    return allowed.filter(item=>items.includes(item));
  };
  const exposure=options.get('--exposure')??'day';
  if(!isExposure(exposure))throw new Error(`--exposure: unknown ${exposure}; expected ${EXPOSURE_IDS.join(',')}`);
  const seconds=Number(options.get('--timeout-seconds')??CATALOGUE_TIMEOUT_S.default);
  if(!Number.isFinite(seconds)||seconds<=0||seconds>CATALOGUE_TIMEOUT_S.max)throw new Error(`--timeout-seconds must be positive and at most ${CATALOGUE_TIMEOUT_S.max}`);
  const views=list('--views',ASKABLE_VIEW_IDS,exposure==='noon'?['V10']:VIEW_IDS);
  if(exposure==='noon'&&views.some(id=>id!=='V10'))throw new Error(`--views ${views.filter(id=>id!=='V10').join(',')}: the noon pass takes the station view V10 only; the neutral stage of the other views is lit by the fixed day rig`);
  if(views.includes(MOTION.id)&&exposure!=='day')throw new Error(`--views ${MOTION.id}: the motion clip is taken at day only, not ${exposure}`);
  if(views.includes(CURVE.id)&&exposure!=='day')throw new Error(`--views ${CURVE.id}: the curve is taken at day only, not ${exposure}`);
  if(views.includes(CURVE_NORMAL.id)&&exposure!=='day')throw new Error(`--views ${CURVE_NORMAL.id}: the curve is taken at day only, not ${exposure}`);
  const waverley=list('--kinds',[...ALL_KINDS,...EDINBURGH_CAPTURE_KINDS],ALL_KINDS).filter(kind=>EDINBURGH_CAPTURE_KINDS.includes(kind)),trackViews=[MOTION.id,CURVE.id,CURVE_NORMAL.id].filter(id=>views.includes(id));
  if(waverley.length&&trackViews.length)throw new Error(`--views ${trackViews.join(',')}: the motion and curve views place a train on the King's Cross track by its core/train.ts layout, which the Waverley kinds (${waverley.join(',')}) do not have`);
  return {dist:options.get('--dist'),out:options.get('--out'),kinds:list('--kinds',[...ALL_KINDS,...EDINBURGH_CAPTURE_KINDS],ALL_KINDS),views,chrome:options.get('--chrome')??null,poses:options.get('--poses')??null,exposure,timeoutMs:seconds*1000};
}

/** Host and build identity for every sidecar: the machine, the git head and the exact page that was photographed. */
export function hostInfo(run=execFileSync,cwd=ROOT) {
  const ask=(command,args)=>{try{return String(run(command,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000})).trimEnd();}catch{return null;}};
  const status=ask('git',['status','--porcelain']);
  return {os:{platform:os.platform(),release:os.release(),arch:os.arch()},macModel:ask('sysctl',['-n','hw.model']),
    git:{head:ask('git',['rev-parse','HEAD']),dirty:status===null?null:status.length>0,dirtyPaths:status===null?null:status.split('\n').filter(Boolean).slice(0,20)}};
}
/** The build hash: sha256 of dist/index.html and the name (and hash) of the main module script it loads. */
export async function buildHash(dist) {
  const index=await readFile(path.join(dist,'index.html')),asset=/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+\.js)"/.exec(index.toString('utf8'))?.[1];
  if(!asset)throw new Error('dist/index.html loads no module script');
  const file=path.resolve(dist,asset.replace(/^(?:\.\/|\/kings-cross\/|\/)/,''));
  if(!file.startsWith(dist+path.sep))throw new Error('main asset escapes dist');
  return {indexSha256:sha256(index),mainAsset:path.basename(file),mainAssetSha256:sha256(await readFile(file))};
}

/** What changed between a shot and the same frame with the subject hidden: which pixels differ (`mask`), how many, and their bounding box. */
export function pixelDiff(shot,baseline,{threshold=10}={}) {
  const a=readPng(shot),b=readPng(baseline);
  if(a.width!==b.width||a.height!==b.height||a.channels!==b.channels)throw new Error('shot and baseline differ in size');
  const {width,height,channels}=a,mask=new Uint8Array(width*height);let changed=0,x0=width,x1=-1,y0=height,y1=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=(y*width+x)*channels;
    if(Math.abs(a.pixels[i]-b.pixels[i])>threshold||Math.abs(a.pixels[i+1]-b.pixels[i+1])>threshold||Math.abs(a.pixels[i+2]-b.pixels[i+2])>threshold) {
      mask[y*width+x]=1;changed++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    }
  }
  return {width,height,changed,mask,fraction:changed/(width*height),bbox:changed?{x0,y0,x1,y1}:null,widthFraction:changed?(x1-x0+1)/width:0,marginLeftPx:changed?x0:null,marginRightPx:changed?width-1-x1:null};
}
/** Of the surface points the geometry check says are seen, how many land on (or next to) a pixel that differs from the empty stage. `ndc` are [x, y] in -1..1. */
export function sampleHits(diff,ndc) {
  let hits=0;
  for(const [nx,ny] of ndc) {
    const px=Math.round((nx+1)/2*diff.width-.5),py=Math.round((1-ny)/2*diff.height-.5);let found=false;
    for(let dy=-1;dy<=1&&!found;dy++)for(let dx=-1;dx<=1;dx++){const x=px+dx,y=py+dy;if(x>=0&&y>=0&&x<diff.width&&y<diff.height&&diff.mask[y*diff.width+x]){found=true;break;}}
    if(found)hits++;
  }
  return {hits,total:ndc.length,rate:ndc.length?hits/ndc.length:0};
}
/**
 * Is the picture a picture of the specimen? Some pixels must differ from the empty stage, and at least half of the surface points the geometry
 * check saw must fall on pixels that differ: the sidecar may not claim a clear view of an image that does not show it. A whole-car or whole-train
 * view (it has `extents`) must also show the subject within 84% of the width, so 8% margins each side, give or take a few pixels. `subject` is the diff
 * of the subject alone (the car for V04; the train, i.e. `diff`, for V05 and the plan).
 */
export function pixelVerdict(view,diff,subject=diff,inspection=null,{minChanged=30,minHitRate=.5,tolerancePx=3}={}) {
  if(!(diff.changed>=minChanged))return {ok:false,reason:`picture shows no specimen: only ${diff.changed} pixels differ from the empty stage (need ${minChanged})`};
  let hits=null;
  if(inspection?.sampleNdc?.length) {
    hits=sampleHits(diff,inspection.sampleNdc);
    if(hits.rate<minHitRate)return {ok:false,reason:`picture does not show the checked surface: ${hits.hits} of ${hits.total} seen sample points sit on pixels that differ from the empty stage`};
  }
  if(view.extents) {
    const w=diff.width,limit=CATALOGUE.fitFraction*w+tolerancePx;
    if(!subject.bbox)return {ok:false,reason:'subject alone leaves no pixels'};
    if(subject.bbox.x1-subject.bbox.x0+1>limit)return {ok:false,reason:`subject spans ${subject.bbox.x1-subject.bbox.x0+1} of ${w} px, over the 84% limit`};
    if(Math.min(subject.marginLeftPx,subject.marginRightPx)<(1-CATALOGUE.fitFraction)/2*w-tolerancePx-1e-9)return {ok:false,reason:`subject margin ${Math.min(subject.marginLeftPx,subject.marginRightPx)} px is under 8% of the width`};
  }
  return {ok:true,changedPixels:diff.changed,changedFraction:diff.fraction,bbox:diff.bbox,...(hits?{sampleHits:hits}:{}),...(view.extents?{subjectBbox:subject.bbox,subjectWidthFraction:subject.widthFraction}:{})};
}

/**
 * Run the planned views of one kind through `steps`. The sequence for each view is: inspect (the geometry check, never moves the camera), then
 * shoot (picture), then verify (pixels), then publish. A view that fails inspect or verify becomes a GAP with the reason: it is recorded, not
 * retried, and not replaced by another pose (the one exception is a frozen V10 camera the scene now blocks, which reseatStationResults searches for again, after this
 * pass, in its own placement). A view the model plan already marked GAP or N/A is passed through. A thrown error is a defect in the
 * run itself, not in the view, and stops the kind.
 */
export async function runCatalogueViews(views,{inspect,shoot,verify,publish,check=()=>{},unavailable=()=>null,now=()=>performance.now()}) {
  const results=[];
  for(const view of views) {
    check();
    if(view.status!=='OK'){results.push({view,status:view.status,reason:view.reason,attempts:0});continue;}
    const missing=unavailable(view);
    if(missing){results.push({view,status:'GAP',reason:missing,functional:true,attempts:0});continue;}
    const t0=now(),inspection=await inspect(view),t1=now();
    if(!inspection?.clear){results.push({view,status:'GAP',reason:inspection?.reason??'view not clear',blocker:inspection?.blocker??null,inspection,attempts:1,timingsMs:{inspect:t1-t0}});continue;}
    const picture=await shoot(view,inspection),t2=now(),verdict=await verify(view,picture,inspection),t3=now();
    const timingsMs={inspect:t1-t0,shoot:t2-t1,verify:t3-t2};
    if(!verdict.ok){results.push({view,status:'GAP',reason:verdict.reason,inspection,attempts:1,timingsMs});continue;}
    results.push({view,status:'OK',reason:null,inspection,verdict,file:await publish(view,picture,inspection,verdict,timingsMs),attempts:1,timingsMs});
  }
  return results;
}

/** Poses frozen by an earlier run: the `catalogue-manifest.json` it wrote. A later run reuses these numbers, or refuses. */
export function loadFrozenPoses(text) {
  let document;try{document=JSON.parse(text);}catch(error){throw new Error(`frozen poses are not JSON: ${error.message}`);}
  if(document?.rubric!==CATALOGUE.rubric||document.schema!=='kx-catalogue-manifest/1'||!document.kinds||typeof document.kinds!=='object')
    throw new Error(`frozen poses must be a ${CATALOGUE.rubric} catalogue manifest (kx-catalogue-manifest/1)`);
  return document;
}
/**
 * Every way the freshly derived poses differ from the frozen ones: a view or kind missing from the frozen file, or a number that moved by more
 * than `tol`. The capture refuses to run on any difference. It never quietly uses the new pose in place of the frozen one.
 */
export function frozenPoseDrift(frozen,plans,{tol=1e-6}={}) {
  const drifts=[];
  for(const [kind,plan] of plans) {
    const held=frozen.kinds[kind];
    if(!held){drifts.push({kind,reason:'kind missing from the frozen poses'});continue;}
    for(const view of plan.views) {
      const entry=frozenEntryOf(held,view);
      if(!entry?.plan){drifts.push({kind,view:view.suffix,reason:'view missing from the frozen poses'});continue;}
      const at=poseDifference(poseOf(view),entry.plan,tol);
      if(at!==null)drifts.push({kind,view:view.suffix,reason:'pose differs from the frozen pose',at});
    }
    if(plan.station)for(const d of stationFrozenDrift(plan.station,held,{tol}))drifts.push({kind,...d});
    // the motion clip is derived by a rule, not searched for: a held manifest that does not have it (a pass before M01 existed) leaves nothing to drift from
    const clip=plan.motion&&held.views?.[plan.motion.suffix];
    if(clip?.plan){const at=poseDifference(motionPoseOf(plan.motion),clip.plan,tol);if(at!==null)drifts.push({kind,view:plan.motion.suffix,reason:'motion plan differs from the frozen plan',at});}
    // the curves are derived the same way: a held manifest from before C01 or C02 existed has nothing to drift from
    for(const curve of [plan.curve,plan.curveNormal]) {
      const bend=curve&&held.views?.[curve.suffix];
      if(bend?.plan){const at=poseDifference(curvePoseOf(curve),bend.plan,tol);if(at!==null)drifts.push({kind,view:curve.suffix,reason:'curve plan differs from the frozen plan',at});}
    }
  }
  return drifts;
}
/** The planned view with the frozen numbers in place of the derived ones (equal within tolerance once frozenPoseDrift passes). */
export function freezeView(view,entry) {
  if(!entry?.plan)return view;
  const p=entry.plan;
  return {...view,frame:p.frame,eye:p.eye,target:p.target,fov:p.fov,up:p.up,near:p.near,region:p.region,
    ...(p.extents?{extents:p.extents}:{}),rotation:view.rotation&&{...view.rotation,rotationY:p.rotationY}};
}

/** Runs in the page (installed with toString, like manualFrames). The stage and the one-view-at-a-time helpers the capture calls; window.__cat holds {T,F}. */
export function catalogueDriver() {
  const cat=window.__cat,k=window.__kx;
  const label=text=>{let el=document.getElementById('capture-train-label');if(!el){el=document.createElement('div');el.id='capture-train-label';el.style.cssText='position:fixed;top:8px;left:8px;padding:6px 8px;background:#fff;color:#172430;font:14px monospace;z-index:999';document.body.append(el);}el.textContent=text;};
  const frame=()=>window.__signalFrame(0);
  const names=list=>list.map(o=>({name:o.name||'',type:o.type}));
  const disposeGeometries=object=>object.traverse(o=>{if(o.geometry)o.geometry.dispose();});
  // The page's own DOM (title chip, status and credit lines, station tabs and their notice, the Almanac button, anything it adds) describes the page, not the
  // specimen, so all of it comes off the pictures: everything in the body but the canvas and the capture label (train-framing.mjs hideChrome; restored by end).
  const keep=()=>({canvas:k.renderer.domElement,keepIds:['capture-train-label']});
  const hideChrome=(hidden=[])=>cat.F.hideChrome(document,window,{...keep(),hidden});
  /** Hide what the page has added since, then list what is still drawn besides the canvas and the label (nothing, or the capture stops). */
  cat.chrome=()=>{
    const dom=hideChrome(cat.state.dom);
    return {hidden:dom.map(({name,drawn,box})=>({name,drawn,box})),visible:cat.F.visibleChrome(document,window,keep())};
  };
  cat.assertChrome=()=>{
    const r=cat.chrome();
    if(r.visible.length)throw new Error(`page chrome would be in the picture: ${r.visible.map(v=>`${v.name} at ${v.box.join(',')}`).join('; ')}`);
    return r;
  };
  /** The page's atmosphere as the frame has it (null under the fixed rig, which has none): the clock, the sun, the weather and the lamp level that lights the trains' windows and lenses. */
  const atmosphereOf=()=>{
    const a=k.atmosphere?.state?.();if(!a)return null;
    const finite=v=>Number.isFinite(v)?v:null,w=a.weather;
    return {timeMs:a.timeMs,iso:new Date(a.timeMs).toISOString(),sun:{elevationDeg:a.sun.elevationDeg,azimuthDeg:a.sun.azimuthDeg},
      weather:{label:w.label,cloud:w.cloud,rain:w.rain,snow:w.snow,visibilityM:finite(w.visibilityM),wet:w.wet,snowCover:w.snowCover,windMs:w.windMs,thunder:w.thunder},
      rig:{daylight:a.rig.daylight,lampLevel:a.rig.lampLevel,stars:a.rig.stars,fogAmount:a.rig.fogAmount,sunIntensity:a.rig.sun.intensity,moonIntensity:a.rig.moon.intensity,hemisphereIntensity:a.rig.hemisphere.intensity}};
  };
  cat.atmosphere=atmosphereOf;
  /**
   * The lamp level the page is giving the trains, read where the shared train material takes it: its onBeforeCompile hook binds the page's `trainNight` object as
   * the `uNight` uniform (web/src/train-geom.ts plain()), so asking the hook for a shader's uniforms gives that object, and its value is what the frame was drawn with.
   * null when no material of the train does.
   */
  const readTrainNight=group=>{
    let value=null;
    group.traverse(o=>{
      if(value!==null||!o.isMesh)return;
      for(const m of Array.isArray(o.material)?o.material:[o.material]) {
        if(typeof m?.onBeforeCompile!=='function')continue;
        const probe={uniforms:{},vertexShader:'',fragmentShader:''};
        try{m.onBeforeCompile(probe,k.renderer);}catch{continue;}
        const night=probe.uniforms.uNight;
        if(night&&typeof night.value==='number'){value=night.value;return;}
      }
    });
    return value;
  };
  const sceneChildren=()=>k.scene.children.map(o=>({name:o.name||'',type:o.type,visible:o.visible}));
  // `zRange` ([z0, z1]) is a stage the specimen drives along (M01) instead of a stage 60 m longer than the train at each end
  cat.begin=(kind,length,zRange)=>{
    const {T,F}=cat;
    if(cat.state)throw new Error('a specimen is already on stage');
    const group=k.evidenceBuildTrain(kind),hidden=F.hideSceneryForStage(k.scene),stage=F.buildCatalogueStage(T,{length,zRange});
    k.scene.add(stage);k.scene.add(group);
    cat.state={kind,length,group,stage,hidden,dom:[],saved:null,ground:{heightAt:()=>F.CATALOGUE.groundY}};
    const dom=hideChrome(cat.state.dom);
    return {hidden:names(hidden),hiddenDom:dom.map(d=>d.name),stage:stage.userData.levels,children:sceneChildren()};
  };
  /** V10: only the specimen is added; the station stays exactly as the page built it (nothing hidden, no stage). */
  cat.beginStation=kind=>{
    const {F}=cat;
    if(cat.state)throw new Error('a specimen is already on stage');
    const group=k.evidenceBuildTrain(kind);k.scene.add(group);
    const terrain=k.parts?.terrain??null;
    cat.state={kind,length:null,group,stage:null,hidden:[],dom:[],saved:null,ground:terrain??{heightAt:()=>F.CATALOGUE.groundY}};
    const dom=hideChrome(cat.state.dom);
    return {hidden:[],hiddenDom:dom.map(d=>d.name),stage:null,scenery:'kept: the page as built, with the specimen added',ground:terrain?'the page terrain':'flat fallback: the page has no terrain',children:sceneChildren()};
  };
  /** One frame for the view the camera has been set to, then the check, the costs and the pose the sidecar reports. */
  const settle=(view,text,pose)=>{
    const {T,F}=cat,s=cat.state;
    label(text);const chrome=cat.assertChrome();frame();
    const moved=Math.max(...k.camera.position.toArray().map((v,i)=>Math.abs(v-pose.position[i])),...k.controls.target.toArray().map((v,i)=>Math.abs(v-pose.target[i])));
    if(moved>1e-6)throw new Error(`the page moved the camera by ${moved} m while rendering the frame`);
    const info={calls:k.renderer.info.render.calls,triangles:k.renderer.info.render.triangles};
    const inspection=F.inspectCatalogueView(T,k.scene,k.camera,s.group,s.ground,view,view.id==='V10'?F.stationCheckOptions():undefined);
    return {pose,inspection,info,costs:F.trainCosts(s.group),placement:{position:s.group.position.toArray(),rotationY:s.group.rotation.y},labelText:text,chrome,atmosphere:atmosphereOf(),trainNight:readTrainNight(s.group)};
  };
  cat.view=(view,text)=>{
    const {T,F}=cat,s=cat.state;
    F.placeStageSpecimen(s.group,s.stage,view.rotation.rotationY);
    const pose=F.setCatalogueView(T,k.camera,k.controls,s.group,view);
    // a lamp view: the page is told the state object, and the frame reports the one it was told
    let lampState=null;
    if(view.capability){
      if(typeof k.setTrainLampState!=='function')throw new Error('the page lost setTrainLampState during the run');
      lampState={...view.capability.state};k.setTrainLampState(s.group,{...lampState});
    }
    return {...settle(view,text,pose),lampState};
  };
  /** V10: a camera given in world metres, the specimen stood where the placement says; the sidecar also gets the pose in the train's own frame. */
  cat.stationView=(view,text)=>{
    const {T,F}=cat,s=cat.state;
    F.placeStageSpecimen(s.group,null,view.placement.rotationY,view.placement.position);
    const pose=F.setWorldView(T,k.camera,k.controls,view);
    return {...settle(view,text,pose),local:{eye:s.group.worldToLocal(new T.Vector3(...view.eye)).toArray(),target:s.group.worldToLocal(new T.Vector3(...view.target)).toArray()}};
  };
  /** V10: the placements' candidate cameras tried best first (searchStation); the report goes back to Node, which freezes what it accepts. */
  cat.stationSearch=placements=>{
    const {T,F}=cat,s=cat.state;
    return F.searchStation(T,{scene:k.scene,camera:k.camera,controls:k.controls,group:s.group,ground:s.ground},placements);
  };
  /**
   * M01: one frame of a clip. The cars are posed as the page's live trains are (spec.cars) and the fixed camera set (spec.camera), one frame is drawn, and then the page is asked what it drew: the level
   * and distance of every bogie, the near-plane clearance of every vertex box, the distance to the leading cab, the cars as they stand and the costs. The renderer's counters are summed over every
   * render call of the frame, not just the last.
   */
  cat.motionFrame=(spec,text)=>{
    const {T,F}=cat,s=cat.state,info=k.renderer.info;
    s.saved=null;
    F.applyCarPoses(s.group,spec.cars);
    const pose=F.setWorldView(T,k.camera,k.controls,spec.camera);
    label(text);const chrome=cat.assertChrome();
    const autoReset=info.autoReset,renders=info.render.frame;
    info.autoReset=false;info.reset();
    try{frame();}finally{info.autoReset=autoReset;}
    const drawn={calls:info.render.calls,triangles:info.render.triangles,renders:info.render.frame-renders};
    const moved=Math.max(...k.camera.position.toArray().map((v,i)=>Math.abs(v-pose.position[i])),...k.controls.target.toArray().map((v,i)=>Math.abs(v-pose.target[i])));
    if(moved>1e-6)throw new Error(`the page moved the camera by ${moved} m while rendering the frame`);
    const clearance=F.checkNearClearance(F.vertexBoxes(T,s.group),pose.position,{near:pose.near,fov:pose.fov,aspect:pose.aspect,marginM:spec.clearanceMarginM});
    return {pose,info:drawn,costs:F.trainCosts(s.group),bogies:F.readBogieLods(T,s.group,k.camera),clearance,cabDistanceM:F.leadingCabPoint(T,s.group).distanceTo(k.camera.position),cars:F.readCars(s.group),
      placement:{position:s.group.position.toArray(),rotationY:s.group.rotation.y},labelText:text,chrome,atmosphere:atmosphereOf(),trainNight:readTrainNight(s.group)};
  };
  /**
   * C01: a specimen begun as usual, then its straight stage taken away for the one that follows the route (`points`, in the specimen's own frame, the frame the cars are posed in).
   * Scenery hidden, the chrome hidden, as for every neutral stage.
   */
  cat.beginCurve=(kind,length,points)=>{
    const {T,F}=cat,begun=cat.begin(kind,length),s=cat.state;
    k.scene.remove(s.stage);disposeGeometries(s.stage);
    s.stage=F.buildCurveStage(T,{points});k.scene.add(s.stage);
    return {...begun,stage:s.stage.userData.levels,children:sceneChildren()};
  };
  /** C01: the cars and the bogies of the specimen as they stand, in its own frame. */
  cat.readCurve=()=>{const {T,F}=cat,s=cat.state;return {cars:F.readCars(s.group),bogies:F.readBogiePoints(T,s.group)};};
  /** C01: the cars posed as createLiveTrains.update poses them (the same function M01 uses), then read back. */
  cat.poseCars=cars=>{const s=cat.state;s.saved=null;cat.F.applyCarPoses(s.group,cars);return cat.readCurve();};
  /** 'empty' hides the specimen, 'car:N' shows only car N, 'all' restores; each draws one frame. */
  cat.isolate=mode=>{
    const s=cat.state,g=s.group;
    if(!s.saved)s.saved=g.children.map(o=>o.visible);
    if(mode==='all'){g.visible=true;g.children.forEach((o,i)=>{o.visible=s.saved[i];});}
    else if(mode==='empty')g.visible=false;
    else{const n=Number(mode.slice(4));g.visible=true;g.children.forEach((o,i)=>{o.visible=s.saved[i]&&o.name==='car-'+n;});}
    frame();return true;
  };
  cat.end=()=>{
    const s=cat.state;if(!s)return false;
    k.scene.remove(s.group);disposeGeometries(s.group);
    if(s.stage){k.scene.remove(s.stage);disposeGeometries(s.stage);}
    for(const o of s.hidden)o.visible=true;
    cat.F.restoreChrome(s.dom);
    document.getElementById('capture-train-label')?.remove();
    k.camera.up.set(0,1,0);cat.state=null;frame();return true;
  };
  return true;
}

/** Serve the built page and the two capture modules; the Almanac back pill is left out so it cannot cover a picture. */
function catalogueServer(root,dist) {
  return createServer(async(req,res)=>{try{
    const u=new URL(req.url,'http://127.0.0.1');let file;
    if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
    if(u.pathname==='/capture/train-framing.mjs')file=path.join(root,'kings-cross-src/tools/train-framing.mjs');
    else if(u.pathname==='/capture/three.core.js')file=path.join(root,'kings-cross-src/node_modules/three/build/three.core.js');
    else if(['/kings-cross/','/kings-cross'].includes(u.pathname))file=path.join(dist,'index.html');
    else if(u.pathname.startsWith('/kings-cross/')){file=path.resolve(dist,decodeURIComponent(u.pathname.slice(13)));if(!file.startsWith(dist+path.sep))throw new Error('path escape');}
    if(!file){res.writeHead(404).end();return;}
    const bytes=await readFile(file);
    res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/octet-stream','cache-control':'no-store'}).end(bytes);
  }catch{res.writeHead(404).end();}});
}
export const CATALOGUE_URL_QUERY='trains=none&board=0&tooltip=0&signals=0';
/**
 * The lighting a pass is taken under, a query appended to CATALOGUE_URL_QUERY so the page is pinned and the picture repeats. `day` is the fixed reference
 * rig the earlier rounds were lit with: the page's `?sky=ref` (web/src/main.ts `fixedSky`: kx.atmosphere is null; hemisphere 1.25, sun 1.7 at
 * CATALOGUE.sunPosition, background 35465e, no tone mapping) with all of the page's scenery. `?bare=1` selects the same rig but also drops the terrain, the
 * city and the landmarks and draws a grid, so V10 would stand in a different station: it is not used. `dusk` pins the page's own clock and weather
 * (`?time=` and `?weather=`; no weather request is made): the sun, sky, lamps and ground of 16:30 UTC on 2026-11-09 under clear skies. The poses of a pass
 * do not depend on its exposure: the sun-bearing rule turns the specimen by CATALOGUE.sunPosition (the day rig's sun) in both, and a dusk pass reuses the
 * poses of a day pass (--poses).
 * `noon` pins the same two things to the daylight pin of the other capture tools (scene-pin.mjs: midsummer noon in London, 2026-06-21T12:00:00+01:00, under clear skies; the `+` of
 * the offset is percent-encoded, or the page would read it as a space and ignore the time). It is how V10 is taken, the one view that stands in the page's scenery: under the day
 * rig the page has no clock of its own to pin (`?time=` turns that rig off), so its station clocks showed the wall clock's time and its sidecars recorded `pinnedTime: null`, and
 * the round-4 score found day V10 not time-pinned. A noon pass takes V10 only (the neutral stage of V01-V09 stays on the day rig), and reuses the frozen poses of an earlier
 * pass (--poses), as a dusk pass does.
 */
const NOON_PIN=scenePinFrom();
export const EXPOSURES=Object.freeze({
  day:Object.freeze({id:'day',query:'sky=ref',rig:'fixed',pinnedTime:null,pinnedWeather:null}),
  noon:Object.freeze({id:'noon',query:pinParameters(NOON_PIN),rig:'atmosphere',pinnedTime:NOON_PIN.time,pinnedWeather:NOON_PIN.weather}),
  dusk:Object.freeze({id:'dusk',query:'time=2026-11-09T16:30:00Z&weather=clear',rig:'atmosphere',pinnedTime:'2026-11-09T16:30:00Z',pinnedWeather:'clear'}),
});
export const EXPOSURE_IDS=Object.freeze(Object.keys(EXPOSURES));
/** Is this the id of an exposure (an own key: `toString` and `constructor` are not)? */
function isExposure(id) { return Object.hasOwn(EXPOSURES,id); }
/** The query of a pass: the catalogue's base query and its exposure's. */
export function catalogueUrlQuery(exposure='day') {
  if(!isExposure(exposure))throw new Error(`unknown exposure ${exposure}`);
  return `${CATALOGUE_URL_QUERY}&${EXPOSURES[exposure].query}`;
}
/** What a pass records of its exposure: the id, the full query, the rig, the pinned time and weather. */
export const exposureRecord=exposure=>({id:exposure,urlQuery:catalogueUrlQuery(exposure),rig:EXPOSURES[exposure].rig,pinnedTime:EXPOSURES[exposure].pinnedTime,pinnedWeather:EXPOSURES[exposure].pinnedWeather});
const SUN_LIGHT=lights=>lights.find(l=>l.type==='DirectionalLight'&&Math.abs(l.intensity-1.7)<1e-9);
/**
 * Is the page lit the way the pass says? `day` is the fixed rig: no atmosphere state, and the sun where the sun-bearing rule puts it. `dusk` is the page's own
 * atmosphere at the pinned instant: it must have a state, at that time (a page that ignored `?time=` would be lit by the wall clock).
 */
export function checkExposure(exposure,session) {
  if(!isExposure(exposure))throw new Error(`unknown exposure ${exposure}`);
  const e=EXPOSURES[exposure];
  if(e.rig==='fixed') {
    if(session.atmosphereState)throw new Error('the day pass needs the fixed rig, but the page has an atmosphere (is ?sky=ref honoured?)');
    const sun=SUN_LIGHT(session.lights);
    if(!sun||sun.position.some((v,i)=>Math.abs(v-CATALOGUE.sunPosition[i])>1e-9))throw new Error(`the page sun is not at ${CATALOGUE.sunPosition}: the sun-bearing rule is stale`);
    return;
  }
  if(!session.atmosphereState)throw new Error(`the ${exposure} pass needs the page's atmosphere, but the page has none (was ?time= or ?weather= ignored?)`);
  if(session.atmosphereState.timeMs!==Date.parse(e.pinnedTime))throw new Error(`the page clock is ${new Date(session.atmosphereState.timeMs).toISOString()}, not the pinned ${e.pinnedTime}`);
}

/**
 * The lamp level the page gives the trains' windows and lenses, and where it was read. `read` is the value the page's shared train material was drawn with (read in
 * the page, see readTrainNight in the driver); without it, the value is worked out: the atmosphere's rig sets `trainNight.value` to its `lampLevel` (web/src/atmosphere.ts
 * apply), and the fixed day rig has no atmosphere, so nothing ever sets it and it keeps its initial 0 (web/src/train-geom.ts), which is inferred from the code.
 */
export function trainNightOf(exposure,atmosphere,read=null) {
  if(typeof read==='number')return {trainNight:read,trainNightSource:'read from the page: the uNight uniform the shared train material is drawn with (web/src/train-geom.ts plain(), bound to trainNight)'};
  if(atmosphere)return {trainNight:atmosphere.rig.lampLevel,trainNightSource:'the page atmosphere: rig.lampLevel, which atmosphere.ts apply copies to trainNight.value'};
  if(exposure.rig==='fixed')return {trainNight:0,trainNightSource:'inferred: the fixed rig has no atmosphere, so trainNight keeps its initial 0 (web/src/train-geom.ts)'};
  return {trainNight:null,trainNightSource:'unavailable: the page gave no atmosphere state'};
}

/** The sidecar of one picture: everything needed to reproduce it and to judge it without opening the page. */
export function catalogueSidecar({kind,view,file,formation,session,host,build,state,result,timings,exposure=exposureRecord('day')}) {
  const live=result.live;
  return {rubric:CATALOGUE.rubric,schema:'kx-catalogue-sidecar/1',kind,file,
    view:{id:view.id,suffix:view.suffix,frame:view.frame,notes:view.notes,car:view.car??null,
      capability:view.capability?{function:view.capability.function,state:view.capability.state}:null,...(view.poseSuffix?{poseFrom:view.poseSuffix}:{})},
    renderer:session.renderer,host:host.os,macModel:host.macModel,git:host.git,build,
    viewport:{width:CATALOGUE.viewport.width,height:CATALOGUE.viewport.height,deviceScaleFactor:CATALOGUE.viewport.deviceScaleFactor,
      canvas:session.size,devicePixelRatio:session.devicePixelRatio},
    // the exposure is what the page was pinned to; `atmosphere` is the page's own state at this frame (null under the fixed day rig), and `trainNight` the lamp level it gives
    // the trains' windows and lenses (web/src/atmosphere.ts apply: trainNight.value = rig.lampLevel)
    renderState:{toneMapping:session.toneMapping,toneMappingExposure:session.toneMappingExposure,outputColorSpace:session.outputColorSpace,background:session.background,fog:session.fog,lights:session.lights,
      exposure:exposure.id,urlQuery:exposure.urlQuery,rig:exposure.rig,pinnedTime:exposure.pinnedTime,pinnedWeather:exposure.pinnedWeather,
      atmosphere:live.atmosphere??null,...trainNightOf(exposure,live.atmosphere??null,live.trainNight??null),lampApi:session.lampApi===true,lampState:live.lampState??null},
    // V01-V09 are planned in the train's own frame; a V10 view is planned in world metres (the station fixes the specimen), so the page reports its train-local pose
    pose:{trainLocal:{eye:live.local?.eye??view.eye,target:live.local?.target??view.target,fov:view.fov,up:view.up,near:view.near,region:view.region,...(view.extents?{extents:view.extents}:{})},
      world:{position:live.pose.position,target:live.pose.target,fov:live.pose.fov,aspect:live.pose.aspect,near:live.pose.near,far:live.pose.far,up:live.pose.up,positionErrorM:live.pose.positionErrorM}},
    specimen:{groupWorldPosition:live.placement.position,rotationY:live.placement.rotationY,rotationRule:view.rotation},
    ...(view.id==='V10'?{station:{placement:view.placement,focus:view.focus,distanceM:view.distanceM,azimuthDeg:view.azimuthDeg,platform:view.platform,platformHeightM:view.platformHeightM,
      horizontalDistanceM:Math.hypot(live.pose.position[0]-live.pose.target[0],live.pose.position[2]-live.pose.target[2]),eyeAbovePlatformM:live.pose.position[1]-view.platformHeightM,
      scenery:state.scenery,ground:state.ground,search:view.search}}:{}),
    formation:{kind,family:formation.family,classes:formation.classes,classNote:formation.classNote,lengthM:formation.length,cars:formation.cars.map(({index,type,length,start,end,cab,bogies,motor,pantograph})=>({index,type,length,start,end,cab,bogies,motor,pantograph}))},
    dimensions:formation.dimensions,
    visibility:live.inspection,pixels:result.verdict,
    hiddenSceneNames:state.hidden,hiddenDom:state.hiddenDom,chrome:live.chrome??null,stage:state.stage,label:live.labelText,
    costs:{trainStatic:live.costs,rendererInfo:live.info},timings};
}

/** The head of the run's manifest: what the run was (rubric, viewport, the sun rule, the exposure, the station, the machine and build, the poses it reused) before any kind is photographed. */
export function catalogueManifest({exposure,stationScene,host,build,poses,motion=false,curve=null,curveNormal=null,generated=new Date().toISOString()}) {
  return {rubric:CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',generated,viewport:CATALOGUE.viewport,
    sunRule:{id:'sun-bearing-v1',sunPosition:CATALOGUE.sunPosition,offsetDeg:CATALOGUE.sunOffsetDeg,
      text:"Each view's specimen is turned about the vertical axis so the camera's bearing from the focus point is within 15 degrees of the page sun's azimuth, the sun nudged toward the specimen's nearest lateral axis (plan view: the upper-left diagonal). A pure function of the view's train-local pose. It always uses the day rig's sun, in every exposure, so a dusk pass turns each specimen exactly as the day pass did."},
    station:stationScene?stationManifest(stationScene):null,exposure:exposureRecord(exposure),...(motion?{motion:motionManifest()}:{}),...(curve?{curve:curveManifest(curve)}:{}),...(curveNormal?{curveNormal:curveManifest(curveNormal,CURVE_NORMAL)}:{}),
    host:host.os,macModel:host.macModel,git:host.git,build,posesFrom:poses,kinds:{}};
}
/** The page address of a run: the local server's port and the query its exposure pins. */
export const cataloguePageUrl=(port,exposure)=>`http://127.0.0.1:${port}/kings-cross/?${catalogueUrlQuery(exposure)}`;
/**
 * The photographs of one view, in the order that matters: the page is checked for chrome, the picture is taken, then the same frame with the specimen hidden (the
 * baseline the pixels are judged against) and, for a whole-car subject, with only that car; the specimen is shown again at the end.
 */
export async function photograph({evaluate,screenshot,view}) {
  await evaluate('window.__cat.assertChrome()');
  const shot=await screenshot();
  await evaluate(`window.__cat.isolate('empty')`);const baseline=await screenshot();
  let subject=null;
  if(view.extents?.scope==='car'){await evaluate(`window.__cat.isolate('car:${view.extents.car}')`);subject=await screenshot();}
  await evaluate(`window.__cat.isolate('all')`);
  return {shot,baseline,subject};
}

// ---- M01: the motion clip, in Node -----------------------------------------------------------------------------------------------------------
// The geometry and the verdicts are in train-framing.mjs (planMotion, judgeMotionFrame, judgeMotionClip). Here: the page's own placement code over a synthetic path, the
// images (a PNG encoder and a contact sheet, with no dependency but node:zlib), the sidecars, the report and the manifest entry, and the run of one kind's clip.
/**
 * A path for the page's placement code to pose a train along: straight edges between points [x, z], as the page's Graph has them (node i at points[i], one edge per pair).
 * `cum[i]` is the distance from the start of the route to node i.
 */
export function polylineRoute(points) {
  if(!Array.isArray(points)||points.length<2)throw new Error('a route needs at least two points');
  const pos=new Map(),adj=new Map(),edges=[],cum=[0];
  points.forEach((p,i)=>{pos.set(i,[p[0],p[1]]);adj.set(i,[]);});
  for(let i=0;i+1<points.length;i++) {
    const length=Math.hypot(points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]);
    if(!(length>0))throw new Error(`route point ${i+1} repeats point ${i}`);
    const edge={wayId:1,a:i,b:i+1,length,service:'main',tunnel:false};
    edges.push(edge);adj.get(i).push(edge);adj.get(i+1).push(edge);cum.push(cum[i]+length);
  }
  return {graph:{pos,adj,edges},cum,lengthM:cum.at(-1),points:points.map(p=>[p[0],p[1]])};
}
/**
 * The train as the page's motion model reports it (core/motion.ts TrainView): its nose `noseS` metres along the route and its tail `lengthM` behind, travelling from the start of
 * the route toward its end. The occupied intervals run tail to nose (fromT < toT, a to b), the heading is clockwise from north (-z).
 */
export function trainViewAt(route,noseS,lengthM,{id=1,speed=0}={}) {
  const tailS=noseS-lengthM,{graph,cum}=route;
  if(tailS<-1e-9||noseS>route.lengthM+1e-9)throw new Error(`a train ${lengthM} m long with its nose ${noseS} m along does not fit a route ${route.lengthM} m long`);
  const occupied=[];
  graph.edges.forEach((edge,j)=>{
    const lo=Math.max(tailS,cum[j]),hi=Math.min(noseS,cum[j+1]);
    if(hi-lo>1e-9)occupied.push({edge,fromT:(lo-cum[j])/edge.length,toT:(hi-cum[j])/edge.length});
  });
  const last=occupied.at(-1);
  if(!last)throw new Error('the train occupies none of the route');
  const a=graph.pos.get(last.edge.a),b=graph.pos.get(last.edge.b);
  return {id,description:'capture',leading:{edge:last.edge,t:last.toT,point:[a[0]+(b[0]-a[0])*last.toT,a[1]+(b[1]-a[1])*last.toT]},heading:Math.atan2(b[0]-a[0],-(b[1]-a[1])),
    speed,lengthM,occupiedLengthM:occupied.reduce((n,s)=>n+Math.abs(s.toT-s.fromT)*s.edge.length,0),occupied,state:'moving',opacity:1,targetBerth:'',lastBerth:'',blocked:false,distanceM:noseS,reversals:0};
}
/** The poses carPoses gives, as the page is told them: what createLiveTrains.update sets on each car node and, from the track direction under each bogie, on its bogies (web/src/trains-live.ts). */
export function pagePoses(poses) {
  return poses.map(pose=>({index:pose.car.index,position:[pose.position[0],pose.position[1]],rotationY:pose.rotationY,scaleZ:pose.scaleZ,
    bogies:[pose.frontBogie,pose.rearBogie].map((sample,k)=>({k,rotationY:Math.atan2(sample.back[0],sample.back[1])-pose.rotationY}))}));
}
/**
 * The cars of every frame of the clip, posed by the page's own placement code (carPoses) over a synthetic straight path along -z, and checked against the plan's geometry: every car
 * is posed, every bogie is where the plan has it (to a micrometre), every car is unturned and unstretched and every bogie stands square to the track. `ok` is false, with the
 * reasons, if carPoses and the geometry disagree; the capture records that as a GAP and does not photograph on poses it cannot vouch for. `place` is the placement code
 * (the page's carPoses), a parameter only so that a test can hand the checks poses that are wrong.
 */
export function motionPoses(formation,plan,place=carPoses) {
  const [zFar,zBehind]=MOTION.zRange,steps=Math.round((zBehind-zFar)/MOTION.routeStepM),layout=trainLayout(formation.kind);
  const route=polylineRoute(Array.from({length:steps+1},(_,i)=>[0,zBehind-i*MOTION.routeStepM])),problems=[];
  let maxErrorM=0;
  const frames=plan.frames.map(frame=>{
    const poses=place(route.graph,trainViewAt(route,zBehind-frame.noseZ,formation.length,{speed:plan.clip.speedMps}),layout),cars=pagePoses(poses);
    if(poses.length!==layout.cars.length||2*poses.length!==plan.bogies.length)problems.push(`frame ${frame.number}: carPoses poses ${poses.length} of ${layout.cars.length} cars and the plan has ${plan.bogies.length} bogies`);
    for(const [n,pose] of poses.entries()) {
      for(const [k,sample] of [pose.frontBogie,pose.rearBogie].entries()) {
        const planned=plan.bogies.find(b=>b.car===pose.car.index&&b.k===k);
        if(!planned){problems.push(`frame ${frame.number}: the plan has no bogie-${pose.car.index}-${k}`);continue;}
        const want=frame.noseZ+planned.z,error=Math.hypot(sample.point[0],sample.point[1]-want);
        maxErrorM=Math.max(maxErrorM,error);
        if(!(error<=1e-6))problems.push(`frame ${frame.number}: carPoses puts bogie-${pose.car.index}-${k} at z ${sample.point[1]} (x ${sample.point[0]}), the geometry says z ${want}`);
        if(!(Math.abs(cars[n].bogies[k].rotationY)<=1e-9))problems.push(`frame ${frame.number}: carPoses turns bogie-${pose.car.index}-${k} by ${cars[n].bogies[k].rotationY} rad on a straight path`);
      }
      if(!(Math.abs(pose.position[0])<=1e-6&&Math.abs(pose.position[1]-frame.noseZ)<=1e-6&&Math.abs(pose.rotationY)<=1e-9&&Math.abs(pose.scaleZ-1)<=1e-9))
        problems.push(`frame ${frame.number}: carPoses puts car-${pose.car.index} at ${pose.position} turned ${pose.rotationY} and stretched ${pose.scaleZ}, the geometry says (0, ${frame.noseZ}), square and unstretched`);
    }
    return {index:frame.index,noseS:zBehind-frame.noseZ,cars};
  });
  return {ok:!problems.length,problems,maxErrorM,frames,route:{points:route.points.length,edges:route.graph.edges.length,lengthM:route.lengthM}};
}

/** A PNG (8-bit RGB or RGBA, no interlace, filter 0 on every row), written with node:zlib alone. `pixels` are `channels` bytes a pixel, row by row. */
export function encodePng({width,height,channels=3,pixels}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||![3,4].includes(channels)||pixels.length!==width*height*channels)throw new Error('the pixels are not width x height x channels bytes');
  const stride=width*channels,raw=Buffer.alloc((stride+1)*height);
  for(let y=0;y<height;y++)raw.set(pixels.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);
  const chunk=(type,data)=>{
    const head=Buffer.alloc(8),tail=Buffer.alloc(4);
    head.writeUInt32BE(data.length,0);head.write(type,4,'ascii');tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4),data]))>>>0,0);
    return Buffer.concat([head,data,tail]);
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=channels===3?2:6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
/** A decoded image (readPng) at 1/factor of its size as RGB: each pixel is the mean of the factor x factor block it covers. */
export function downscale(image,factor) {
  const width=Math.floor(image.width/factor),height=Math.floor(image.height/factor),pixels=Buffer.alloc(width*height*3),area=factor*factor;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++) {
    let sum=0;
    for(let dy=0;dy<factor;dy++)for(let dx=0;dx<factor;dx++)sum+=image.pixels[((y*factor+dy)*image.width+x*factor+dx)*image.channels+c];
    pixels[(y*width+x)*3+c]=Math.round(sum/area);
  }
  return {width,height,channels:3,pixels};
}
/** The digits 0-9 as 3 x 5 bit maps, row by row. */
const DIGIT_GLYPHS=Object.freeze(['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111']);
export const SHEET_COLOURS=Object.freeze({background:[32,38,46],gap:[128,128,128],flip:[255,140,0],label:[0,0,0],digit:[255,255,255]});
/**
 * The contact sheet of a clip as RGB pixels. `frames` are { number, image, flips } in order: `image` is a decoded PNG (readPng) a whole number of times the tile size, or null for
 * a frame that is not a picture; `flips` is how many bogies are first read bare at that frame. The grid has `columns` tiles to a row, frame 1 at the top left, tiles `gap` pixels
 * apart. A tile is its frame at the tile size; a frame that is not a picture is a grey tile. Each flip is an orange square along the top of the tile, and the frame's number is
 * drawn white on black at its bottom left.
 */
export function contactSheet(frames,{columns,tileWidth,tileHeight,gap}=MOTION.sheet) {
  const rows=Math.ceil(frames.length/columns),width=columns*tileWidth+(columns+1)*gap,height=rows*tileHeight+(rows+1)*gap,pixels=Buffer.alloc(width*height*3);
  const fill=(x0,y0,w,h,[r,g,b])=>{for(let y=Math.max(0,y0);y<Math.min(height,y0+h);y++)for(let x=Math.max(0,x0);x<Math.min(width,x0+w);x++){const i=(y*width+x)*3;pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;}};
  fill(0,0,width,height,SHEET_COLOURS.background);
  frames.forEach((frame,n)=>{
    const x0=gap+(n%columns)*(tileWidth+gap),y0=gap+Math.floor(n/columns)*(tileHeight+gap);
    if(frame.image) {
      const factor=Math.round(frame.image.width/tileWidth);
      if(factor<1||frame.image.width!==tileWidth*factor||frame.image.height!==tileHeight*factor)throw new Error(`frame ${frame.number} is ${frame.image.width}x${frame.image.height}, not a whole number of times ${tileWidth}x${tileHeight}`);
      const tile=downscale(frame.image,factor);
      for(let y=0;y<tileHeight;y++)tile.pixels.copy(pixels,((y0+y)*width+x0)*3,y*tileWidth*3,(y+1)*tileWidth*3);
    }else fill(x0,y0,tileWidth,tileHeight,SHEET_COLOURS.gap);
    for(let i=0;i<frame.flips;i++)fill(x0+4+i*14,y0+4,10,10,SHEET_COLOURS.flip);
    const text=String(frame.number),scale=3;
    fill(x0+4,y0+tileHeight-4-7*scale,(text.length*4+1)*scale,7*scale,SHEET_COLOURS.label);
    [...text].forEach((digit,d)=>{
      const glyph=DIGIT_GLYPHS[Number(digit)];
      for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(glyph[row*3+col]==='1')fill(x0+4+(1+d*4+col)*scale,y0+tileHeight-4-7*scale+(1+row)*scale,scale,scale,SHEET_COLOURS.digit);
    });
  });
  return {width,height,channels:3,pixels};
}

/** The scene children the capture hid, by name and then type. The page adds some of them as it finishes loading, so its own order changes from run to run and a clip's files would not repeat. */
export const sortedObjects=list=>[...list].sort((p,q)=>p.name<q.name?-1:p.name>q.name?1:p.type<q.type?-1:p.type>q.type?1:0);
/** The sidecar of one frame of the clip: the usual sidecar of a picture (renderer, viewport, render state, pose, specimen, formation, costs) and a `motion` block of what makes it a frame of a clip. */
export function motionSidecar({kind,plan,frame,file,formation,session,host,build,state,read,judged,verdict,exposure=exposureRecord('day'),timings}) {
  const number=String(frame.number).padStart(2,'0'),camera=plan.camera;
  const view={id:plan.id,suffix:`${plan.suffix}-${number}`,frame:'motion',eye:camera.eye,target:camera.target,fov:camera.fov,up:camera.up,near:camera.near,
    notes:{...plan.notes,frame:{index:frame.index,number:frame.number,of:plan.frames.length,timeS:frame.timeS,travelM:frame.travelM,noseZ:frame.noseZ}},
    rotation:{rule:'none: the cars are posed along the path by carPoses and the specimen stays at the origin',rotationY:0}};
  // the camera in the train's own frame (the nose at z = 0, +z along the body): the cars are unturned, so only the nose's position moves it
  const local={eye:[camera.eye[0],camera.eye[1],camera.eye[2]-frame.noseZ],target:[camera.target[0],camera.target[1],camera.target[2]-frame.noseZ]};
  const sidecar=catalogueSidecar({kind,view,file,formation,session,host,build,state,result:{verdict,live:{...read,local,inspection:read.clearance}},timings,exposure});
  return {...sidecar,hiddenSceneNames:sortedObjects(state.hidden),motion:{id:plan.id,stage:MOTION_STAGE,trackLengthM:plan.clip.trackLengthM,speedMps:plan.clip.speedMps,stepS:plan.clip.stepS,lodDistanceM:plan.clip.lodDistanceM,
    frame:{index:frame.index,number:frame.number,of:plan.frames.length,timeS:frame.timeS,travelM:frame.travelM,noseZ:frame.noseZ,middleZ:frame.middleZ,tailZ:frame.tailZ},
    cabDistanceM:read.cabDistanceM,plannedCabDistanceM:frame.cabDistanceM,bogies:judged.rows,baseTriangles:judged.baseTriangles,maxDistanceErrorM:judged.maxDistanceErrorM,
    rendererInfo:read.info,trainStatic:read.costs,clearance:read.clearance,mismatches:judged.mismatches,problems:judged.problems}};
}
/** What the manifest says once of the clip (the rule, the stage and the numbers), written when a run is asked for M01. */
export const motionManifest=()=>({id:MOTION.id,suffix:MOTION.suffix,stage:MOTION_STAGE,rule:MOTION_RULE,stationScene:MOTION_STATION_NOTE,speedMps:MOTION.speedMps,stepS:MOTION.stepS,frames:MOTION.frames,
  trackLengthM:MOTION.zRange[1]-MOTION.zRange[0],zRange:MOTION.zRange,lodDistanceM:MOTION.lodDistanceM,lateralM:MOTION.lateralM,sheet:MOTION.sheet,exposure:'day'});
/**
 * `<kind>-motion.json`: the clip in one file. Its status and reason; the stage, speed, step and frames; each bogie's name, its full and bare costs from the static counter, the frame it was first
 * read bare at against the one the geometry predicts, and the frames either side of the flip with their files; the whole train's cost with every bogie full and with every bogie bare; each frame's
 * status, distances, clearance and costs; the sheet.
 */
export function motionReport({kind,plan,formation,clip,frames,poses,sheet,session,host,build,exposure,state}) {
  const at=i=>i===null||!frames[i]?null:{index:i,number:i+1,file:frames[i].file,status:frames[i].status};
  const bogies=clip.flips.map(x=>{
    const planned=plan.bogies.find(b=>b.name===x.name),cost=clip.costs.perBogie.find(c=>c.name===x.name),rows=frames.map(f=>f.judged.rows.find(w=>w.name===x.name));
    return {name:x.name,car:planned.car,k:planned.k,zM:planned.z,near:cost?.near??null,far:cost?.far??null,plannedFirstFarIndex:x.plannedFirstFarIndex,firstFarIndex:x.firstFarIndex,equal:x.equal,
      lastNear:x.lastNearIndex===null?null:{...at(x.lastNearIndex),distanceM:x.lastNearDistanceM},firstFar:x.firstFarIndex===null?null:{...at(x.firstFarIndex),distanceM:x.firstFarDistanceM},
      level:rows.map(w=>w?.level??null),distanceM:rows.map(w=>w?.distanceM??null),plannedDistanceM:planned.distanceM};
  });
  return {rubric:CATALOGUE.rubric,schema:'kx-catalogue-motion/1',kind,id:plan.id,status:clip.status,reason:clip.reason,
    stage:MOTION_STAGE,trackLengthM:plan.clip.trackLengthM,speedMps:plan.clip.speedMps,stepS:plan.clip.stepS,frameCount:plan.clip.frames,travelM:plan.clip.travelM,lodDistanceM:plan.clip.lodDistanceM,
    rule:MOTION_RULE,stationScene:MOTION_STATION_NOTE,clip:plan.clip,camera:plan.camera,
    formation:{kind,family:formation.family,classes:formation.classes,classNote:formation.classNote,lengthM:formation.length,cars:formation.cars.map(({index,type,length,start,end,cab,bogies:b,motor,pantograph})=>({index,type,length,start,end,cab,bogies:b,motor,pantograph}))},
    flips:{bogies:bogies.length,allEqual:clip.flips.every(x=>x.equal),minBoundaryMarginM:plan.checks.minBoundaryMarginM,maxDistanceErrorM:clip.maxDistanceErrorM,mismatches:clip.mismatches},bogies,
    costs:{note:'triangles and draw calls from the static counter (visible meshes, independent of the frustum), read after each frame was rendered',baseTriangles:clip.costs.baseTriangles,baseTrianglesEqual:clip.costs.baseTrianglesEqual,
      allNear:clip.costs.allNear,allBare:clip.costs.allBare,savedTriangles:clip.costs.savedTriangles,savedDrawCalls:clip.costs.savedDrawCalls,perFrame:clip.costs.perFrame},
    frames:frames.map(f=>({index:f.index,number:f.number,file:f.file,status:f.status,reason:f.reason,...plan.frames[f.index],cabDistanceReadM:f.read.cabDistanceM,maxDistanceErrorM:f.judged.maxDistanceErrorM,
      bogieLevels:f.judged.rows.map(w=>w.level),clearance:f.read.clearance,pixels:f.pixels,rendererInfo:f.read.info,trainStatic:f.read.costs,baseTriangles:f.judged.baseTriangles,problems:f.judged.problems})),
    checks:{...plan.checks,clearance:plan.clearance,poses:{maxErrorM:poses.maxErrorM,route:poses.route}},
    sheet:sheet?{file:sheet,...MOTION.sheet,rows:Math.ceil(plan.frames.length/MOTION.sheet.columns),ticks:'one orange square along the top of a tile for each bogie first read bare at that frame; grey tile: the frame is a GAP'}:null,
    renderer:session.renderer,exposure:exposure.id,host:host.os,macModel:host.macModel,git:host.git,build,hiddenSceneNames:sortedObjects(state.hidden),stageLevels:state.stage};
}
/** One kind's M01 line in the manifest: the frozen plan, and what became of the clip and where its files are. */
export function motionManifestEntry(plan,result) {
  return {id:plan.id,suffix:plan.suffix,plan:motionPoseOf(plan),notes:plan.notes,
    outcome:{status:result.status,reason:result.reason??null,file:result.status==='OK'?result.report??null:null,report:result.report??null,sheet:result.sheet??null,
      stage:MOTION_STAGE,trackLengthM:plan.clip.trackLengthM,speedMps:plan.clip.speedMps,stepS:plan.clip.stepS,frameCount:plan.clip.frames,
      frames:(result.frames??[]).map(f=>({index:f.index,number:f.number,status:f.status,reason:f.reason,file:f.file})),
      flips:(result.flips??[]).map(x=>({name:x.name,firstFarIndex:x.firstFarIndex,plannedFirstFarIndex:x.plannedFirstFarIndex,equal:x.equal}))}};
}
/**
 * One kind's motion clip against a page that has the catalogue driver: pose the cars with the page's own placement code, draw each frame, ask the page what it drew, photograph it
 * and write the pictures with their sidecars, the contact sheet and the report. A frame that is not a picture of the clip (the near plane cuts the train, the page is not as it was asked to
 * be, no train in the picture) is a GAP with its reason and is not published. A plan that is already a GAP, or poses the geometry does not vouch for, are recorded without touching the page.
 * `publish(file, bytes, sidecar)` writes a picture and its sidecar, `write(file, bytes)` any other file. Returns { entry }, the manifest entry.
 */
export async function captureMotionClip({kind,plan,formation,evaluate,screenshot,publish,write,session,host,build,exposure,check=()=>{},now=()=>performance.now()}) {
  const none={frames:[],flips:[],report:null,sheet:null};
  if(plan.status!=='OK')return {entry:motionManifestEntry(plan,{...none,status:'GAP',reason:plan.reason})};
  const poses=motionPoses(formation,plan);
  if(!poses.ok)return {entry:motionManifestEntry(plan,{...none,status:'GAP',reason:`the page's placement code (carPoses) disagrees with the geometry: ${poses.problems.slice(0,3).join('; ')}`})};
  const state=await evaluate(`window.__cat.begin(${JSON.stringify(kind)},${formation.length},${JSON.stringify(MOTION.zRange)})`),frames=[];
  try {
    for(const frame of plan.frames) {
      check();
      const i=frame.index,cars=poses.frames[i].cars,text=`${kind} motion ${plan.id} - frame ${frame.number}/${plan.frames.length} - ${frame.timeS} s, ${frame.travelM} m on - ${MOTION_STAGE}`;
      const t0=now(),read=await evaluate(`window.__cat.motionFrame(${JSON.stringify({camera:plan.camera,cars,clearanceMarginM:MOTION.clearanceMarginM})},${JSON.stringify(text)})`),t1=now();
      const judged=judgeMotionFrame(plan,i,read,cars),record={index:i,number:frame.number,status:'OK',reason:null,file:null,read,judged,shot:null,pixels:null};
      if(judged.gap){record.status='GAP';record.reason=judged.gap;}
      else if(judged.problems.length){record.status='GAP';record.reason=judged.problems.slice(0,3).join('; ');}
      else {
        const picture=await photograph({evaluate,screenshot,view:{}}),t2=now(),verdict=pixelVerdict({},pixelDiff(picture.shot,picture.baseline)),t3=now();
        record.pixels=verdict;
        if(!verdict.ok){record.status='GAP';record.reason=verdict.reason;}
        else {
          const file=`${kind}-${plan.suffix}-${String(frame.number).padStart(2,'0')}.png`;
          await publish(file,picture.shot,motionSidecar({kind,plan,frame,file,formation,session,host,build,state,read,judged,verdict,exposure,timings:{read:t1-t0,shoot:t2-t1,verify:t3-t2}}));
          record.file=file;record.shot=picture.shot;
        }
      }
      frames.push(record);
    }
  } finally {await evaluate('window.__cat.end()');}
  const clip=judgeMotionClip(plan,frames),flipsAt=new Map();
  for(const x of clip.flips)if(x.firstFarIndex!==null)flipsAt.set(x.firstFarIndex,(flipsAt.get(x.firstFarIndex)??0)+1);
  let sheet=null;
  if(frames.some(f=>f.file)) {
    sheet=`${kind}-${plan.suffix}-sheet.png`;
    await write(sheet,encodePng(contactSheet(frames.map(f=>({number:f.number,image:f.shot?readPng(f.shot):null,flips:flipsAt.get(f.index)??0})))));
  }
  const report=`${kind}-${plan.suffix}.json`;
  await write(report,Buffer.from(JSON.stringify(motionReport({kind,plan,formation,clip,frames,poses,sheet,session,host,build,exposure,state}),null,2)+'\n'));
  return {entry:motionManifestEntry(plan,{status:clip.status,reason:clip.reason,report,sheet,frames,flips:clip.flips})};
}

/** Every placement a station search tried, with what it found view by view, for captures.json (the manifest keeps the chosen placement's detail). */
export const stationSearchSummary=report=>report.map(r=>({placement:r.placementId,clear:r.clear,
  views:Object.fromEntries(Object.entries(r.views).map(([s,v])=>[s,{tested:v.tested,acceptedAzimuthDeg:v.accepted?.azimuthDeg??null,failures:failureSummary(v.tried)}]))}));

/**
 * V10 views with no clear camera at their stop, searched at the other stops where the page lets the train stand (ALTERNATE_RULE; alternatePlacementsFor): `gaps` are [{ view, reason, blocker }]
 * and `search(placements)` is the page's search. Returns `moves` (the views that found a camera: new views standing in their new placement), `stays` (suffix -> the reason a view stays a GAP,
 * which says what both searches found) and the page's `report` (null when nothing was asked: no gap, or a plan with no other stop).
 */
export async function searchOtherStops({station,gaps,search}) {
  if(!gaps.length||!station.alternates?.length)return {moves:[],stays:new Map(),report:null};
  const report=await search(alternatePlacementsFor(station,gaps.map(g=>g.view.suffix)));
  return {...alternateViewsFromSearch(station,gaps,report),report};
}

/**
 * The views of a fresh V10 search, with each that has no clear camera at the stop (a GAP the plan itself did not give, with a placement to name) searched for at the other stops
 * (searchOtherStops): the views in their places, a view that found a camera standing in its new placement, one that did not a GAP whose reason says both searches, and the page's report
 * (null when nothing was asked).
 */
export async function moveGapViews({views,station,search}) {
  const gaps=views.filter(v=>v.status==='GAP'&&v.placement&&station.views.some(s=>s.suffix===v.suffix&&s.status==='OK')).map(v=>({view:v,reason:v.reason,blocker:v.blocker??null}));
  const other=await searchOtherStops({station,gaps,search});
  if(!other.report)return {views,report:null};
  return {views:views.map(v=>other.moves.find(m=>m.suffix===v.suffix)??(other.stays.has(v.suffix)?{...v,reason:other.stays.get(v.suffix)}:v)),report:other.report};
}

/**
 * V10 on frozen poses: the results of one kind's frozen station views, with every frozen camera the scene now blocks, and every view frozen as a GAP that the plan asks for,
 * searched for again in its own placement (reseatBlockedStationViews) and the views that search found photographed. A frozen GAP is an earlier answer too: it was recorded
 * under the candidate list the rule had then, and the rule may have tried more positions since (it once stopped at the spread; the neighbours pass came after). Only a view that
 * was OK in the plan and whose inspection found its camera blocked, or one frozen as a GAP whose spec the plan itself marks OK, is reseated: a GAP the plan itself gives (its spec
 * is not OK), a view whose pixels failed and a view that was not frozen are left as recorded. A view's own placement is the kind's stop, or the other stop it moved to. A view that
 * still has no clear camera there is searched at the other stops the page lets the train stand (searchOtherStops), and takes the first that gives it one. `search(placements)` is the page's
 * search, `capture(views)` photographs views as the first pass did. Returns the results in their order, the search's report of the views' own placements (null when nothing was
 * blocked, so nothing was searched) and `other`, the report of the other stops (null when none was searched).
 */
export async function reseatStationResults({results,station,search,capture}) {
  const asked=r=>station.views.some(s=>s.suffix===r.view.suffix&&s.status==='OK');
  const blocked=results.filter(r=>r.view.id==='V10'&&r.view.search?.frozen&&r.status==='GAP'&&(r.view.status==='OK'?r.inspection&&!r.inspection.clear:r.view.status==='GAP'&&asked(r)));
  const groups=new Map();
  for(const b of blocked) {
    const placement=findPlacement(station,b.view.placement?.id);
    if(!placement)continue;
    if(!groups.has(placement.id))groups.set(placement.id,{placement,blocked:[]});
    groups.get(placement.id).blocked.push(b);
  }
  if(!groups.size)return {results,report:null,other:null};
  const report=[],replacements=[],stays=new Map();
  for(const group of groups.values()) {
    const found=await search([group.placement]);
    report.push(...found);
    const answer=reseatBlockedStationViews(station,group.blocked,found);
    replacements.push(...answer.replacements);
    for(const [suffix,reason] of answer.stays)stays.set(suffix,reason);
  }
  const gaps=[...stays].map(([suffix,reason])=>{const b=blocked.find(x=>x.view.suffix===suffix);return {view:b.view,reason,blocker:b.blocker??b.view.blocker??null};});
  const other=await searchOtherStops({station,gaps,search});
  for(const move of other.moves)replacements.push(move);
  for(const [suffix,reason] of other.stays)stays.set(suffix,reason);
  const again=replacements.length?await capture(replacements):[];
  return {results:results.map(r=>again.find(a=>a.view.suffix===r.view.suffix)??(stays.has(r.view.suffix)?{...r,reason:stays.get(r.view.suffix)}:r)),report,other:other.report};
}

// ---- C01: the curve, in Node -----------------------------------------------------------------------------------------------------------------
// The route, the plan and the verdicts are in train-framing.mjs (curveRouteFor, planCurve, judgeCurvePage, curveVerdict). Here: the page's own placement code over the route, the
// steps a picture goes through (shared with the other views), the sidecars, the report and the manifest entry, and the run of one kind's curve.
/**
 * A route made of edges of the page's graph, the track a train runs along edge after edge: `steps` are [{ edge, from }], `from` the node the train enters the edge at (its other end is
 * where it leaves, the next step's `from`). The distance along it is the page's own, the edges' lengths (the chords) end to end: `cum[j]` is the distance to the start of step j.
 */
export function chainRoute(graph,steps) {
  if(!Array.isArray(steps)||!steps.length)throw new Error('a route needs at least one edge');
  const cum=[0],list=[];
  steps.forEach(({edge,from},j)=>{
    if(from!==edge.a&&from!==edge.b)throw new Error(`step ${j} enters edge ${edge.a}-${edge.b} at node ${from}, which is not on it`);
    if(j>0){const prev=steps[j-1],left=prev.from===prev.edge.a?prev.edge.b:prev.edge.a;if(left!==from)throw new Error(`step ${j} enters at node ${from}, but step ${j-1} leaves at node ${left}`);}
    list.push({edge,forward:from===edge.a,lengthM:edge.length});cum.push(cum[j]+edge.length);
  });
  return {graph,steps:list,cum,lengthM:cum.at(-1)};
}
/**
 * The train as the motion model reports it on such a route (trainViewAt is the same for a straight path): its nose `noseM` along the route and its tail `lengthM` behind, each occupied
 * interval in the edge's own terms (fromT to toT: a to b when the train runs that way, b to a when it runs against it) and the heading read off the edge's curve (edgePoint) at the nose.
 */
export function chainViewAt(route,noseM,lengthM,{id=1,speed=0}={}) {
  const tailM=noseM-lengthM,{graph,cum}=route;
  if(tailM<-1e-9||noseM>route.lengthM+1e-9)throw new Error(`a train ${lengthM} m long with its nose ${noseM} m along does not fit a route ${route.lengthM} m long`);
  const occupied=[];
  route.steps.forEach((step,j)=>{
    const lo=Math.max(tailM,cum[j]),hi=Math.min(noseM,cum[j+1]);
    if(hi-lo>1e-9){const u0=(lo-cum[j])/step.lengthM,u1=(hi-cum[j])/step.lengthM;occupied.push({edge:step.edge,fromT:step.forward?u0:1-u0,toT:step.forward?u1:1-u1});}
  });
  const last=occupied.at(-1);
  if(!last)throw new Error('the train occupies none of the route');
  const {point,dir}=edgePoint(graph,last.edge,last.toT),sign=Math.sign(last.toT-last.fromT);
  return {id,description:'capture',leading:{edge:last.edge,t:last.toT,point},heading:Math.atan2(dir[0]*sign,-dir[1]*sign),
    speed,lengthM,occupiedLengthM:occupied.reduce((n,s)=>n+Math.abs(s.toT-s.fromT)*s.edge.length,0),occupied,state:'moving',opacity:1,targetBerth:'',lastBerth:'',blocked:false,distanceM:noseM,reversals:0};
}
/**
 * Where the page's placement code poses a train for a route: `chain`, the edges of the page's graph (built with curves) that a route found on the page's track runs along, or the straight
 * chords of the points of the synthetic arc; `apexM`, how far along the chain (the page's own measure, the chords) the route's tightest point is; and `where(m)`, the place in the world
 * at distance m along the chain, found from the route's own points by the share of each edge's curve, so not through edgePoint, which is what the poses are checked against.
 */
export function placementRoute(route,graph) {
  const dense=cumulative(route.points);
  if(route.source!=='real') {
    const path=polylineRoute(route.points);
    return {chain:chainRoute(path.graph,path.graph.edges.map(edge=>({edge,from:edge.a}))),apexM:route.apexS,where:m=>pointAlong(path.points,path.cum,m)};
  }
  const steps=route.steps.map(s=>{
    const edge=(graph.adj.get(s.from)??[]).find(e=>e.wayId===s.way&&((e.a===s.from&&e.b===s.to)||(e.a===s.to&&e.b===s.from)));
    if(!edge)throw new Error(`the page's graph has no edge of way ${s.way} between nodes ${s.from} and ${s.to}`);
    return {edge,from:s.from};
  });
  const chain=chainRoute(graph,steps),at=route.apexAt;
  return {chain,apexM:chain.cum[at.step]+at.share*chain.steps[at.step].lengthM,where:m=>{
    const k=segmentAt(chain.cum,m),s=route.steps[k],u=(m-chain.cum[k])/chain.steps[k].lengthM;
    return pointAlong(route.points,dense,dense[s.fromIndex]+u*(dense[s.toIndex]-dense[s.fromIndex]));
  }};
}
/**
 * The route of a run, from the data the page is built from: the tightest real bend of the page's smooth track (the graph built with curves, whose curves the finder reads) that the
 * longest kind fits, the same for every kind whatever `--kinds` says, and the chain of the page's edges the placement code poses along. With `typical` the bend nearest the radius that is
 * typical of that track instead (typicalRadius, found from the track alone), which is returned with it.
 */
export async function loadCurveRoute(file=fileURLToPath(new URL('../web/src/data/kx-track.json',import.meta.url)),{typical=false}={}) {
  const bytes=await readFile(file),data=JSON.parse(bytes.toString('utf8')),graph=buildGraph(data,{curves:true});
  const longest=ALL_KINDS.map(kind=>({kind,lengthM:trainLayout(kind).length})).reduce((a,b)=>b.lengthM>a.lengthM?b:a);
  const shapeOf=(a,b)=>shapeFrom(graph.shapes,a,b),radius=typical?typicalRadius(data,{shapeOf}):null;
  if(typical&&!radius)throw new Error('the page\'s track has no bend to take a typical radius from');
  const route=curveRouteFor(data,longest.lengthM,{shapeOf,...(radius?{typical:radius}:{})});
  return {route,placement:placementRoute(route,graph),longest,trackData:{file:'kings-cross-src/web/src/data/kx-track.json',sha256:sha256(bytes)},...(radius?{typical:radius}:{})};
}
/**
 * The cars of one kind on the route, posed by the page's own placement code (`place`, carPoses; a parameter only so that a test can hand the checks poses that are wrong) with the
 * middle of the train on the route's tightest point, then turned into the frame of the route. Checked against the geometry first: each bogie is where the route has it at its distance
 * behind the nose (to CURVE.placementToleranceM), and each car is turned, stretched and put where the chord between its own bogies says. `problems` is every way carPoses and the geometry
 * disagree, or a train that does not fit the route; the plan records that as a GAP.
 */
export function curvePoses(formation,{route,placement},place=carPoses) {
  const layout=trainLayout(formation.kind),length=formation.length,{chain,apexM,where}=placement,noseM=apexM+length/2,problems=[];
  if(noseM-length<-1e-9||noseM>chain.lengthM+1e-9)return {ok:false,problems:[`a train ${length} m long with its middle on the tightest point does not fit the ${chain.lengthM} m of the route's edges`],maxErrorM:null,noseM,route:{points:route.points.length,lengthM:route.lengthM},poses:[],cars:[]};
  const raw=place(chain.graph,chainViewAt(chain,noseM,length),layout);
  let maxErrorM=0;
  for(const pose of raw) {
    const here=pose.car.bogies.map(z=>where(noseM-z)),[front,rear]=[pose.frontBogie.point,pose.rearBogie.point];
    [front,rear].forEach((point,k)=>{
      const error=Math.hypot(point[0]-here[k][0],point[1]-here[k][1]);maxErrorM=Math.max(maxErrorM,error);
      if(!(error<=CURVE.placementToleranceM))problems.push(`carPoses puts bogie-${pose.car.index}-${k} at (${point}), the route has it at (${here[k]})`);
    });
    const dx=rear[0]-front[0],dz=rear[1]-front[1],chord=Math.hypot(dx,dz),scaleZ=chord/(pose.car.bogies[1]-pose.car.bogies[0]),turned=Math.abs(Math.atan2(Math.sin(pose.rotationY-Math.atan2(dx,dz)),Math.cos(pose.rotationY-Math.atan2(dx,dz))));
    const put=Math.hypot(pose.position[0]-(front[0]-dx/chord*scaleZ*pose.car.bogies[0]),pose.position[1]-(front[1]-dz/chord*scaleZ*pose.car.bogies[0]));
    if(!(turned<=1e-9&&Math.abs(pose.scaleZ-scaleZ)<=1e-9&&put<=1e-6))problems.push(`carPoses puts car-${pose.car.index} at ${pose.position} turned ${pose.rotationY} and stretched ${pose.scaleZ}, the chord between its bogies says (${front[0]-dx/chord*scaleZ*pose.car.bogies[0]},${front[1]-dz/chord*scaleZ*pose.car.bogies[0]}) turned ${Math.atan2(dx,dz)} and stretched ${scaleZ}`);
  }
  const frame=frameTransform(route),local=raw.map(p=>localPose(p,frame));
  return {ok:!problems.length,problems,maxErrorM,noseM,route:{points:route.points.length,lengthM:route.lengthM},
    poses:local.map(p=>({index:p.car.index,start:p.car.start,end:p.car.end,bogies:[...p.car.bogies],position:[...p.position],rotationY:p.rotationY,scaleZ:p.scaleZ,front:[...p.frontBogie.point],rear:[...p.rearBogie.point]})),cars:pagePoses(local)};
}
/** One kind's plan on the route: the poses the page's carPoses gives, the two views and every joint (planCurve), the gangway of the family and web/src/train.ts END_GAP as the specification. `pose` is C01's (CURVE) or C02's (CURVE_NORMAL). */
export function planCurveFor(formation,curve,place=carPoses,pose=CURVE) {
  return planCurve(formation,curve.route,curvePoses(formation,curve,place),{gangwayWidthM:bodySpec(formation.family).gangway.width,endGapM:END_GAP},pose);
}

/**
 * The steps a view goes through, as runCatalogueViews takes them: inspect (the page frames the view and checks it), shoot (the picture and its empty-stage baseline), verify (the pixels)
 * and publish (the picture with its sidecar). `label(view)` is the text the page shows in the picture's corner; `extra(view)` is merged into the sidecar (a block a kind of view adds).
 */
export function catalogueViewSteps({kind,formation,evaluate,screenshot,publish,session,host,build,state,exposure,check=()=>{},label,extra=()=>({})}) {
  const live=new Map();
  return {
    check,
    unavailable:view=>view.capability&&!session.lampApi?view.capability.reason:null,
    inspect:async view=>{const r=await evaluate(`window.__cat.${view.id==='V10'?'stationView':'view'}(${JSON.stringify(view)},${JSON.stringify(label(view))})`);live.set(view,r);return r.inspection;},
    shoot:view=>photograph({evaluate,screenshot,view}),
    verify:async(view,picture,inspection)=>{const diff=pixelDiff(picture.shot,picture.baseline);return pixelVerdict(view,diff,picture.subject?pixelDiff(picture.subject,picture.baseline):diff,inspection);},
    publish:async(view,picture,inspection,verdict,timingsMs)=>{
      const file=`${kind}-${view.suffix}.png`;
      return publish(file,picture.shot,{...catalogueSidecar({kind,view,file,formation,session,host,build,state,result:{verdict,live:live.get(view)},timings:timingsMs,exposure}),...extra(view)});
    },
  };
}
/** The `curve` block of a picture's sidecar: the route, where the train stands on it and the verdicts (the findings themselves are in the report). */
export const curveBlock=(plan,view,verdict)=>({id:plan.id,stage:CURVE_STAGE,view:view.suffix,route:plan.route,noseM:plan.noseM,
  checks:{status:verdict.status,findings:verdict.findings.length,bodies:verdict.bodies,couplers:verdict.couplers,gangways:verdict.gangways,bogies:verdict.bogies}});
/**
 * What the manifest says once of a curve: the rule, the stage, the route (with its points in the page's world) and the data it was found in; for C02 also the radius that is typical of
 * the track and what it was made of, and the route's `pick` (how near that bend the stretch is). `curve` is CURVE (C01) or CURVE_NORMAL (C02).
 */
export const curveManifest=({route,longest,trackData,typical=null},curve=CURVE)=>({id:curve.id,suffix:curve.suffix,stage:CURVE_STAGE,rule:curve.rule??CURVE_RULE,longestKind:longest.kind,longestM:longest.lengthM,trackData,
  ...(typical?{typical}:{}),
  route:{source:route.source,smooth:route.smooth,radiusM:route.radiusM,turnDeg:route.turnDeg,baselineM:route.baselineM,apex:route.apex,lengthM:route.lengthM,apexS:route.apexS,points:route.points,steps:route.steps,apexAt:route.apexAt,
    ways:route.ways,services:route.services,tunnel:route.tunnel,chain:route.chain,searched:route.searched,frame:route.local,...(route.pick?{pick:route.pick}:{}),...(route.note?{note:route.note}:{})},
  views:curve.id===CURVE_NORMAL.id?CURVE_NORMAL_VIEWS:CURVE_VIEWS,exposure:'day'});
/**
 * `<kind>-curve.json`: the curve in one file. Its status and reason; the route and where the train stands on it; every joint's numbers; the bogies as the page has them; the
 * verdicts and each finding with the sentence that explains it; each view's file, camera, rotation, pixels and inspection.
 */
export function curveReport({kind,plan,formation,status,reason,verdict,page,results,session,host,build,exposure,state}) {
  return {rubric:CATALOGUE.rubric,schema:'kx-catalogue-curve/1',kind,id:plan.id,status,reason,stage:CURVE_STAGE,rule:plan.notes?.rule??CURVE_RULE,route:plan.route,noseM:plan.noseM,path:plan.path,
    formation:{kind,family:formation.family,classes:formation.classes,classNote:formation.classNote,lengthM:formation.length,cars:formation.cars.map(({index,type,length,start,end,cab,bogies,motor,pantograph})=>({index,type,length,start,end,cab,bogies,motor,pantograph}))},
    checks:{status:verdict.status,findings:verdict.findings,bodies:verdict.bodies,couplers:verdict.couplers,gangways:verdict.gangways,bogies:verdict.bogies,
      reading:'bodies: the footprints of two neighbours must not touch; couplers and gangways: the boundary points of two neighbours (the end of the first car, the start of the second, at the middle and at each edge of the gangway opening) must be no further apart than one bellows reaches (END_GAP); bogies: each must stand on the path within 1 cm'},
    joints:plan.joints,bogies:page?.rows??[],pageProblems:page?.problems??[],
    views:results.map(r=>({suffix:r.view.suffix,status:r.status,reason:r.reason??null,file:r.file??null,eye:r.view.eye,target:r.view.target,up:r.view.up,fov:r.view.fov,near:r.view.near,distanceM:r.view.notes.distanceM,rotation:r.view.rotation,
      pixels:r.verdict??null,visibleFraction:r.inspection?.visibleFraction??null,checkedSamples:r.inspection?.checkedSamples??null})),
    renderer:session.renderer,exposure:exposure.id,host:host.os,macModel:host.macModel,git:host.git,build,hiddenSceneNames:sortedObjects(state.hidden),stageLevels:state.stage};
}
/** One kind's C01 or C02 line in the manifest: the frozen plan, and what became of the pictures and the checks. */
export function curveManifestEntry(plan,result) {
  return {id:plan.id,suffix:plan.suffix,plan:curvePoseOf(plan),notes:plan.notes,
    outcome:{status:result.status,reason:result.reason??null,report:result.report??null,stage:CURVE_STAGE,
      views:(result.views??[]).map(r=>({suffix:r.view.suffix,status:r.status,reason:r.reason??null,file:r.file??null})),
      checks:{status:result.verdict.status,findings:result.verdict.findings.length}}};
}
/**
 * One kind's curve against a page that has the catalogue driver: put the specimen on the stage that follows the route, pose the cars as the page's live trains are, read back what the page
 * has and judge it, then take the two views through the usual steps (inspect, shoot, verify, publish) and write the report. A page that is not as it was asked to be, or a view that fails
 * its checks, is a GAP with its reason; a failed check of the joints or the bogies is a FINDING, in the report and the entry, and never a failed picture. A plan that is already a GAP is
 * recorded without touching the page. Returns { entry, verdict }.
 */
export async function captureCurve({kind,plan,formation,evaluate,screenshot,publish,write,session,host,build,exposure,check=()=>{}}) {
  if(plan.status!=='OK'){const verdict=curveVerdict(plan);return {entry:curveManifestEntry(plan,{status:'GAP',reason:plan.reason,verdict}),verdict};}
  check();
  const state=await evaluate(`window.__cat.beginCurve(${JSON.stringify(kind)},${formation.length},${JSON.stringify(plan.path)})`);
  let page,verdict,results=[];
  try {
    page=judgeCurvePage(plan,await evaluate(`window.__cat.poseCars(${JSON.stringify(plan.cars)})`));verdict=curveVerdict(plan,page);
    if(!page.problems.length)results=await runCatalogueViews(plan.views,catalogueViewSteps({kind,formation,evaluate,screenshot,publish,session,host,build,state,exposure,check,
      label:view=>`${kind} catalogue specimen on ${CURVE_STAGE} - ${view.id} ${view.suffix} - ${plan.route.source==='real'?(plan.route.pick?'typical real bend':'tightest real bend'):'SYNTHETIC arc'}, R ${plan.route.radiusM.toFixed(1)} m`,
      extra:view=>({hiddenSceneNames:sortedObjects(state.hidden),curve:curveBlock(plan,view,verdict)})}));
  } finally {await evaluate('window.__cat.end()');}
  const reasons=[];
  if(page.problems.length)reasons.push(`the page is not as the capture posed it: ${page.problems.slice(0,3).join('; ')}`);
  for(const r of results)if(r.status!=='OK')reasons.push(`${r.view.suffix}: ${r.reason}`);
  const status=reasons.length?'GAP':'OK',reason=reasons.length?reasons.join('; '):null,report=`${kind}-${plan.suffix}.json`;
  await write(report,Buffer.from(JSON.stringify(curveReport({kind,plan,formation,status,reason,verdict,page,results,session,host,build,exposure,state}),null,2)+'\n'));
  return {entry:curveManifestEntry(plan,{status,reason,report,views:results,verdict}),verdict};
}

export async function catalogueMain(args) {
  const opts=parseCatalogueArgs(args),root=ROOT,scratch=await realpath(path.join(root,'.scratch'));
  if(opts.exposure!=='day'&&!opts.poses)throw new Error(`--exposure ${opts.exposure} reuses the poses of a day pass, so poses cannot change between exposures: give --poses <the day pass's catalogue-manifest.json>`);
  const dist=await realpath(path.resolve(opts.dist)),out=path.resolve(opts.out);
  const inside=p=>{const r=path.relative(scratch,p);return !r.startsWith('..')&&!path.isAbsolute(r);};
  if(!inside(out)||out===scratch)throw new Error('--out must be under worktree .scratch');
  for(let parent=out;;) {try{if(!inside(await realpath(parent)))throw new Error('output symlink escapes .scratch');break;}catch(e){if(e.code!=='ENOENT')throw e;parent=path.dirname(parent);}}
  const stageIds=opts.views.filter(id=>id!=='V10'),stationScene=opts.views.includes('V10')?await loadStationScene():null,withMotion=opts.views.includes(MOTION.id);
  const curve=opts.views.includes(CURVE.id)?await loadCurveRoute():null,curveNormal=opts.views.includes(CURVE_NORMAL.id)?await loadCurveRoute(undefined,{typical:true}):null;
  const plans=new Map(opts.kinds.map(kind=>{const formation=describeFormation(kind);
    return [kind,{kind,formation,views:planCatalogueViews(formation).filter(v=>stageIds.includes(v.id)).map(v=>viewForExposure(v,opts.exposure)),station:stationScene?planStation(formation,stationScene):null,motion:withMotion?planMotion(formation):null,
      curve:curve?planCurveFor(formation,curve):null,curveNormal:curveNormal?planCurveFor(formation,curveNormal,carPoses,CURVE_NORMAL):null}];}));
  let frozen=null,frozenSha=null;
  if(opts.poses) {
    const bytes=await readFile(path.resolve(opts.poses));frozen=loadFrozenPoses(bytes.toString('utf8'));frozenSha=sha256(bytes);
    const drifts=frozenPoseDrift(frozen,plans);
    if(drifts.length)throw new Error(`refusing to capture: ${drifts.length} pose(s) differ from ${opts.poses}: ${drifts.slice(0,8).map(d=>`${d.kind}/${d.view??'*'} ${d.reason}${d.at?` at ${d.at}`:''}`).join('; ')}`);
    for(const plan of plans.values()){
      plan.views=plan.views.map(v=>freezeView(v,frozenEntryOf(frozen.kinds[plan.kind],v)));
      if(plan.station)plan.stationViews=stationViewsFromFrozen(plan.station,frozen.kinds[plan.kind]);
    }
  }
  const counts=Object.fromEntries([...plans].map(([kind,plan])=>[kind,[...plan.views,...(plan.stationViews??plan.station?.views??[]),...(plan.motion?[plan.motion]:[])].reduce((n,v)=>({...n,[v.status]:(n[v.status]??0)+1}),[plan.curve,plan.curveNormal].filter(Boolean).reduce((n,c)=>({...n,[c.status]:(n[c.status]??0)+1}),{}))]));
  if(opts.chrome==='none'){console.log(JSON.stringify({catalogue:true,rubric:CATALOGUE.rubric,kinds:opts.kinds,views:opts.views,exposure:opts.exposure,posesFrozen:!!frozen,planned:counts}));return;}
  const chromePath=opts.chrome??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';await stat(chromePath);
  await mkdir(out,{recursive:true});
  const host=hostInfo(),build=await buildHash(dist),started=performance.now();
  let chrome,cdp,profile,server,cleanup,fatal,session;
  const lifetime=createCaptureLifetime({timeoutMs:opts.timeoutMs,onStop:()=>cdp?.close()});
  const manifest=catalogueManifest({exposure:opts.exposure,stationScene,host,build,poses:frozen?{file:path.resolve(opts.poses),sha256:frozenSha}:null,motion:withMotion,curve,curveNormal});
  const summary={kinds:{},timingsMs:{},...(curve?{curveChecks:{}}:{}),...(curveNormal?{curveNormalChecks:{}}:{})};
  try {
    server=catalogueServer(root,dist);
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    profile=await mkdtemp(path.join(scratch,'train-catalogue-chrome-'));
    chrome=spawn(chromePath,chromeArgs(profile),{detached:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
    lifetime.attach(chrome);
    cdp=cdpPipe(chrome);const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
    const send=(m,p)=>{lifetime.check();return cdp.send(m,p,sessionId);};
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:CATALOGUE.viewport.width,height:CATALOGUE.viewport.height,deviceScaleFactor:CATALOGUE.viewport.deviceScaleFactor,mobile:false});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`(${manualFrames.toString()})();window.__captureDocument=location.href;`});
    const url=cataloguePageUrl(server.address().port,opts.exposure);
    await send('Page.navigate',{url});
    for(const deadline=performance.now()+30000;;){
      let ready=false;try{ready=await evaluate(`window.__captureDocument===${JSON.stringify(url)}&&!!window.__kx?.ready&&typeof window.__kx.evidenceBuildTrain==='function'`);}catch(error){if(!/context|navigat/i.test(error.message))throw error;}
      if(ready)break;if(performance.now()>deadline)throw new Error('page startup timed out after 30 s');await new Promise(r=>setTimeout(r,50));
    }
    session=await evaluate(`(async()=>{const k=window.__kx;await k.cityLoaded;window.__signalFrame(0);const T=await import('/capture/three.core.js'),F=await import('/capture/train-framing.mjs');window.__cat={T,F,state:null};
      const g=k.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info'),c=k.renderer.domElement;
      return {renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),toneMapping:k.renderer.toneMapping,toneMappingExposure:k.renderer.toneMappingExposure,outputColorSpace:k.renderer.outputColorSpace,
        background:k.scene.background?.getHexString?.()??null,fog:k.scene.fog?{type:k.scene.fog.type,near:k.scene.fog.near,far:k.scene.fog.far,color:k.scene.fog.color.getHexString()}:null,
        size:[c.width,c.height],devicePixelRatio:window.devicePixelRatio,inner:[innerWidth,innerHeight],aspect:k.camera.aspect,lampApi:typeof k.setTrainLampState==='function',
        atmosphereState:k.atmosphere?.state?.()?{timeMs:k.atmosphere.state().timeMs}:null,
        lights:k.scene.children.filter(o=>o.isLight).map(o=>({name:o.name||'',type:o.type,intensity:o.intensity,color:o.color.getHexString(),position:o.position.toArray()}))};})()`);
    if(!/Metal/i.test(session.renderer)||/SwiftShader|llvmpipe|software/i.test(session.renderer))throw new Error(`real Metal GPU required: ${session.renderer}`);
    if(session.size[0]!==CATALOGUE.viewport.width||session.size[1]!==CATALOGUE.viewport.height||session.devicePixelRatio!==1||Math.abs(session.aspect-CATALOGUE.aspect)>1e-9)throw new Error(`page viewport is ${session.size.join('x')} at ${session.devicePixelRatio}x, aspect ${session.aspect}; need ${CATALOGUE.viewport.width}x${CATALOGUE.viewport.height} at 1x`);
    checkExposure(opts.exposure,session);
    if(opts.kinds.some(kind=>EDINBURGH_CAPTURE_KINDS.includes(kind)))await evaluate(EDINBURGH_BUILD_HOOK);
    await evaluate(`(${catalogueDriver.toString()})()`);
    Object.assign(manifest.exposure,{atmosphere:await evaluate('window.__cat.atmosphere()')});
    const shoot=async()=>Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64');
    const publish=async(file,bytes,sidecar)=>{await writeFile(path.join(out,file),bytes,{flag:'wx',mode:0o600});await writeFile(path.join(out,file+'.json'),JSON.stringify(sidecar,null,2)+'\n',{flag:'wx',mode:0o600});return file;};
    // the views of one specimen already on stage: check, photograph (with the empty-stage baseline), verify the pixels, write the picture and its sidecar
    const captureViews=(kind,plan,views,state)=>runCatalogueViews(views,catalogueViewSteps({kind,formation:plan.formation,evaluate,screenshot:shoot,publish,session,host,build,state,exposure:manifest.exposure,check:()=>lifetime.check(),
      label:view=>`${kind} catalogue specimen ${view.id==='V10'?"at King's Cross, station scenery kept":'on neutral stage'} - ${view.id} ${view.suffix}`}));
    const write=(file,bytes)=>writeFile(path.join(out,file),bytes,{flag:'wx',mode:0o600});
    for(const [kind,plan] of plans) {
      lifetime.check();const kindStart=performance.now();
      const entries={};
      if(plan.views.length) {
        const state=await evaluate(`window.__cat.begin(${JSON.stringify(kind)},${plan.formation.length})`);
        try {for(const r of await captureViews(kind,plan,plan.views,state))entries[r.view.suffix]=manifestEntry(r);}
        finally {await evaluate('window.__cat.end()');}
      }
      if(plan.station) {
        // V10 on the page as built: the specimen is added to the station, searched for its cameras (unless the poses are frozen), then photographed
        const state=await evaluate(`window.__cat.beginStation(${JSON.stringify(kind)})`);
        try {
          let views=plan.stationViews;
          const searchPage=placements=>evaluate(`window.__cat.stationSearch(${JSON.stringify(placements)})`);
          if(!views){
            const report=await searchPage(plan.station.placements);
            views=stationViewsFromSearch(plan.station,report);
            (summary.stationSearch??={})[kind]=stationSearchSummary(report);
            // a view with no clear camera at the stop is searched at the other stops the page lets this train stand (ALTERNATE_RULE)
            const moved=await moveGapViews({views,station:plan.station,search:searchPage});
            views=moved.views;
            if(moved.report)(summary.stationOtherStops??={})[kind]=stationSearchSummary(moved.report);
          }
          let results=await captureViews(kind,plan,views,state);
          if(plan.stationViews) {
            // frozen cameras the scene now blocks (a bench, a post, an overhead-line mast another change put in the line) are searched for again, in their placement: nothing else moves
            const again=await reseatStationResults({results,station:plan.station,search:searchPage,capture:views=>captureViews(kind,plan,views,state)});
            results=again.results;
            if(again.report)(summary.stationReseat??={})[kind]=stationSearchSummary(again.report);
            if(again.other)(summary.stationOtherStops??={})[kind]=stationSearchSummary(again.other);
          }
          for(const r of results)entries[r.view.suffix]=manifestEntry(r);
        } finally {await evaluate('window.__cat.end()');}
      }
      if(plan.motion) {
        // M01: the clip on its own stage (captureMotionClip begins and ends the specimen itself)
        const {entry}=await captureMotionClip({kind,plan:plan.motion,formation:plan.formation,evaluate,screenshot:shoot,publish,write,session,host,build,exposure:manifest.exposure,check:()=>lifetime.check()});
        entries[entry.suffix]=entry;
      }
      let bend='';
      if(plan.curve) {
        // C01: the train on the curve, on its own stage (captureCurve begins and ends the specimen itself); a failed check is a finding, counted apart from the pictures' statuses
        const {entry,verdict}=await captureCurve({kind,plan:plan.curve,formation:plan.formation,evaluate,screenshot:shoot,publish,write,session,host,build,exposure:manifest.exposure,check:()=>lifetime.check()});
        entries[entry.suffix]=entry;summary.curveChecks[kind]={status:verdict.status,findings:verdict.findings.length};bend=` (curve checks ${verdict.status}, ${verdict.findings.length} finding(s))`;
      }
      if(plan.curveNormal) {
        // C02: the same on the bend of the radius that is typical of the track
        const {entry,verdict}=await captureCurve({kind,plan:plan.curveNormal,formation:plan.formation,evaluate,screenshot:shoot,publish,write,session,host,build,exposure:manifest.exposure,check:()=>lifetime.check()});
        entries[entry.suffix]=entry;summary.curveNormalChecks[kind]={status:verdict.status,findings:verdict.findings.length};bend+=` (typical curve checks ${verdict.status}, ${verdict.findings.length} finding(s))`;
      }
      manifest.kinds[kind]={formation:manifestFormation(plan.formation),views:entries};
      const tally={};for(const e of Object.values(entries))tally[e.outcome.status]=(tally[e.outcome.status]??0)+1;
      summary.kinds[kind]=tally;summary.timingsMs[kind]=Math.round(performance.now()-kindStart);
      console.log(`${kind}: ${JSON.stringify(tally)}${bend} in ${(summary.timingsMs[kind]/1000).toFixed(1)} s`);
    }
  }catch(error){fatal={reason:error.message,stack:error.stack};}
  finally{cdp?.close();cleanup=await cleanupCaptureBrowser(chrome,profile);lifetime.dispose();server?.closeAllConnections();if(server?.listening)await new Promise(r=>server.close(r));}
  const totalMs=Math.round(performance.now()-started);
  await writeFile(path.join(out,'catalogue-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(path.join(out,'captures.json'),JSON.stringify({rubric:CATALOGUE.rubric,mode:'catalogue',renderer:session?.renderer??null,kinds:opts.kinds,views:opts.views,summary,totalMs,cleanup,fatal,stopped:lifetime.reason(),
    posesFrom:manifest.posesFrom,host:host.os,macModel:host.macModel,git:host.git,build},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({catalogue:true,out,summary,totalMs,fatal:fatal?.reason??null,cleanup}));
  process.exitCode=lifetime.reason()?process.exitCode:fatal?1:0;
}
/** One view's line in the manifest: the frozen pose that was derived, and what became of it. */
export function manifestEntry(result) {
  const {view}=result;
  return {id:view.id,suffix:view.suffix,plan:poseOf(view),...(view.poseSuffix?{poseFrom:view.poseSuffix}:{}),rotation:view.rotation??null,notes:view.notes??null,car:view.car??null,
    // the reason is what a missing page function is reported as: it belongs to the GAP that says so, not to a picture the page could take
    capability:view.capability?(result.functional?view.capability:{function:view.capability.function,state:view.capability.state}):null,
    outcome:{status:result.status,reason:result.reason??null,file:result.file??null,blocker:result.blocker??view.blocker??null,
      ...(view.search?{search:view.search}:{}),
      ...(result.status==='GAP'&&result.inspection?{inspection:result.inspection}:{}),
      ...(result.status==='OK'?{checkedSamples:result.inspection.checkedSamples,visibleFraction:result.inspection.visibleFraction,pixels:result.verdict}:{})}};
}

export async function main(args=process.argv.slice(2)) {
  for(let i=0;i<args.length;i+=2)if(args[i]==='--mode'&&args[i+1]==='catalogue')return catalogueMain(args);
  const options=new Map();for(let i=0;i<args.length;i+=2){if(!['--motion','--dimensions','--dist','--out','--chrome','--sclass','--timeout-seconds','--mode'].includes(args[i])||!args[i+1]||options.has(args[i]))throw new Error('usage: train-capture.mjs --motion <axis05.json> --dimensions <axis03.json> --dist <dist> --out <.scratch/shots> [--mode portal] [--chrome none|path]');options.set(args[i],args[i+1]);}
  const required=n=>{if(!options.has(n))throw new Error(`missing ${n}`);return path.resolve(options.get(n));};
  const root=ROOT,scratch=await realpath(path.join(root,'.scratch'));
  const reportFile=required('--motion');let report=JSON.parse(await readFile(reportFile,'utf8')),dimensions=JSON.parse(await readFile(required('--dimensions'),'utf8'));
  const portalMode=options.get('--mode')==='portal';if(options.has('--mode')&&!portalMode)throw new Error('--mode must be portal or catalogue');
  const inputs=report.reproducibility.inputHashes;
  const schedulePolicy=await frozenSchedulePolicy(inputs.schedules);
  const anchorsBytes=await frozenBytes(inputs.anchors),graphBytes=await frozenBytes(inputs.graph),recordings=await Promise.all(inputs.recordings.map(frozenBytes));
  const graph=JSON.parse(graphBytes),anchors=JSON.parse(anchorsBytes);
  if(portalMode)report={...report,portalMode:true,captureCandidates:[portalCapturePlan(recordings.map(b=>parseRecording(b.toString())),graph,anchors,schedulePolicy.serviceFor)]};
  const {requirements,plans}=capturePlans(report);
  const currentGraph=await readFile(path.join(root,'kings-cross-src/web/src/data/kx-track.json'));
  if(createHash('sha256').update(currentGraph).digest('hex')!==inputs.graph.sha256)throw new Error('page graph changed; regenerate axis05 and rebuild');
  const kinds=dimensions.kinds?.map(k=>k.kind);if(kinds?.length!==ALL_KINDS.length||new Set(kinds).size!==kinds.length||ALL_KINDS.some(k=>!kinds.includes(k)))throw new Error('invalid Axis 03 dimensions report');
  if(dimensions.inputs?.anchors?.sha256!==inputs.anchors.sha256||dimensions.inputs?.recordings?.some((r,i)=>r.sha256!==inputs.recordings[i]?.sha256))throw new Error('dimension and motion inputs differ');
  if(dimensions.inputs.recordings.length!==inputs.recordings.length||dimensions.inputs.motionReport?.sha256!==createHash('sha256').update(await readFile(reportFile)).digest('hex'))throw new Error('dimension report belongs to a different motion report; regenerate Axis 03');
  const dist=await realpath(required('--dist')),out=required('--out');
  const inside=p=>{const r=path.relative(scratch,p);return !r.startsWith('..')&&!path.isAbsolute(r);};
  if(!inside(out))throw new Error('--out must be under worktree .scratch');
  let parent=out;for(;;){try{if(!inside(await realpath(parent)))throw new Error('output symlink escapes .scratch');break;}catch(e){if(e.code!=='ENOENT')throw e;parent=path.dirname(parent);}}
  await mkdir(out,{recursive:true});
  const table=options.has('--sclass')?await readFile(required('--sclass')):null;
  if(table){const value=JSON.parse(table);if(!value||value.area!==anchors.area||!Array.isArray(value.hypotheses))throw new Error('--sclass must be the relay hypothesis document (sclass.json), not the decoded-address report');}
  if(options.get('--chrome')==='none'){console.log(JSON.stringify({inputsVerified:true,requirements,candidates:plans.length,kinds,stagingTracks:catalogueTracks(graph,27).length,
    schedules:(inputs.schedules??[]).map(({date,capturedPath,sha256,bytes})=>({date,capturedPath,sha256,bytes})),
    sclass:table?createHash('sha256').update(table).digest('hex'):null,anchorCounts:{anchored:anchors.anchors.length,unmapped:anchors.unmapped.length},portalPlans:portalMode?plans:undefined}));return;}
  const describeStart=performance.now();report=describeCaptureFrames(report,recordings.map(b=>parseRecording(b.toString())),graph,anchors,schedulePolicy.serviceFor);const descriptionsMs=performance.now()-describeStart;
  const chromePath=options.get('--chrome')??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';await stat(chromePath);
  const timeoutMs=Number(options.get('--timeout-seconds')??720)*1000;
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>840000)throw new Error('--timeout-seconds must be positive and at most 840');
  let chrome,cdp,profile,server,cleanup,motionResult,fatal,currentSession;
  const timings=[{phase:'frame-descriptions',elapsedMs:descriptionsMs}],closeups=[],failedCloseups=[],requests=[];
  const tableInput=table?{source:required('--sclass'),sha256:createHash('sha256').update(table).digest('hex')}:null;
  if(table){await mkdir(path.join(out,'inputs'),{recursive:true});await writeFile(path.join(out,'inputs',`sclass-${tableInput.sha256.slice(0,12)}.json`),table,{mode:0o600});}
  const frozen={anchors:anchorsBytes,recording:recordings[0],table,schedules:schedulePolicy.schedules};
  const lifetime=createCaptureLifetime({timeoutMs,onStop:()=>cdp?.close()});
  const phase=(name,work)=>measuredPhase(timings,name,work);
  const starts=recordings.map(bytes=>JSON.parse(bytes.toString().split('\n').find(s=>s.trim())).t);
  try {
    server=createServer(async(req,res)=>{try{
      const begin=performance.now(),endpoint=frozenTrainEndpoint(req.url,frozen);
      if(endpoint){requests.push({url:req.url,bytes:Buffer.byteLength(endpoint.body),status:endpoint.status??200,elapsedMs:performance.now()-begin});res.writeHead(endpoint.status??200,{'content-type':endpoint.type,'cache-control':'no-store'}).end(endpoint.body);return;}
      const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
      let file;if(u.pathname==='/capture/train-framing.mjs')file=path.join(root,'kings-cross-src/tools/train-framing.mjs');else if(u.pathname==='/capture/three.core.js')file=path.join(root,'kings-cross-src/node_modules/three/build/three.core.js');else if(u.pathname==='/almanac-back.js')file=path.join(root,'almanac-back.js');else if(['/kings-cross/','/kings-cross'].includes(u.pathname))file=path.join(dist,'index.html');else if(u.pathname.startsWith('/kings-cross/')){file=path.resolve(dist,decodeURIComponent(u.pathname.slice(13)));if(!file.startsWith(dist+path.sep))throw new Error('path escape');}
      if(!file){res.writeHead(404).end();return;}const bytes=await readFile(file);res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}).end(bytes);
    }catch{res.writeHead(404).end();}});
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    profile=await mkdtemp(path.join(scratch,'train-capture-chrome-'));
    chrome=spawn(chromePath,chromeArgs(profile),{detached:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
    lifetime.attach(chrome);
    cdp=cdpPipe(chrome);const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
    const send=(m,p)=>{lifetime.check();return cdp.send(m,p,sessionId);};
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`(${manualFrames.toString()})();window.__captureDocument=location.href;`});
    let loadSerial=0;
    const load=async recordingIndex=>phase('page-load',async()=>{
      frozen.recording=recordings[recordingIndex];const start=starts[recordingIndex];
      const url=replayUrl(`http://127.0.0.1:${server.address().port}`,start)+`&capture=${++loadSerial}`;
      await send('Page.navigate',{url});const deadline=performance.now()+20000;
      for(;;){
        let ready=false;try{ready=await evaluate(`window.__captureDocument===${JSON.stringify(url)}&&!!window.__kx?.motion&&window.__kx.feed.connection==='playing'`);}catch(error){if(!/context|navigat/i.test(error.message))throw error;}
        if(ready)break;if(performance.now()>deadline)throw new Error('replay startup timed out after 20 s');await new Promise(r=>setTimeout(r,50));
      }
      const prepared=await evaluate(`(async()=>{const k=window.__kx;await k.cityLoaded;window.__signalFrame(0);const T=await import('/capture/three.core.js'),F=await import('/capture/train-framing.mjs');window.__trainCapture={T,F};const hidden=[];for(const p of [k.parts.shed,k.parts.buildings])if(p?.visible){p.visible=false;hidden.push(p.name||p.type);}const g=k.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),hidden,sceneLayers:k.scene.children.map(o=>({name:o.name||o.type,type:o.type,visible:o.visible})),timeMs:k.feed.timeMs,signalCounts:k.signals?.counts()??null};})()`);
      if(!/Metal/i.test(prepared.renderer)||/SwiftShader|llvmpipe|software/i.test(prepared.renderer))throw new Error(`real Metal GPU required: ${prepared.renderer}`);
      if(prepared.timeMs!==start)throw new Error('new document replay clock was not initialized at the frozen start');
      return currentSession={start,url,...prepared};
    });
    const replay=replaySession(load,(elapsedMs,atMs)=>phase('replay-seek',async()=>{
      const time=await evaluate(`(()=>{window.__signalFrame(${elapsedMs});return window.__kx.feed.timeMs;})()`);
      if(time!==atMs)throw new Error('manual replay seek did not land at the requested recorded time');
    }));
    const picture=async check=>{
      const png=await send('Page.captureScreenshot',{format:'png'});await check();return Buffer.from(png.data,'base64');
    };
    const publish=async(file,metadata,bytes)=>{
      await writeFile(path.join(out,file),bytes,{flag:'wx',mode:0o600});await writeFile(path.join(out,file+'.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx',mode:0o600});
    };
    const save=async(file,metadata,check)=>phase('png-and-sidecar',async()=>publish(file,metadata,await picture(check)));
    motionResult=await captureSequences(report,async plan=>{
      if(portalMode) {
        let session;
        const captured=await capturePortalFrames(plan,{
          check:()=>lifetime.check(),
          seek:async frame=>{session=await replay.at(plan.recordingIndex,frame.timeMs);},
          inspect:(frame,candidate,fixed)=>phase('fixed-portal-camera-and-raycast',()=>evaluate(`(()=>{
            const k=window.__kx,t=k.trains.find(t=>t.id===${plan.trainId}),v=k.motionState.find(t=>t.id===${plan.trainId}),{T,F}=window.__trainCapture;
            if(!t||!v)throw new Error('planned portal train not drawn');
            let camera=${JSON.stringify(fixed)??'undefined'};
            if(camera)F.setCaptureView(T,k.camera,k.controls,camera.position,camera.target,camera.fov);
            else camera=F.portalTrainCamera(T,k.camera,k.controls,t.group,v.leading.point,k.parts.terrain,${JSON.stringify(plan.portal)},${candidate}).camera;
            if(window.__trainMarker){k.scene.remove(window.__trainMarker);window.__trainMarker=null;}
            t.group.userData.captureDraws=0;t.group.traverse(o=>{if(o.isMesh)o.onAfterRender=()=>t.group.userData.captureDraws++;});
            const track=k.scene.getObjectByName('track-tunnel');if(track){track.userData.captureDraws=0;track.onAfterRender=()=>track.userData.captureDraws++;}
            window.__signalFrame(${frame.timeMs-session.start});
            const visibility=F.inspectPortalEntryFrame(T,k.scene,k.camera,t.group,k.parts.terrain,${JSON.stringify(plan.portal)},{initial:${frame===plan.frames[0]}});
            if(visibility.track)visibility.track.rendered=track?.userData.captureDraws>0;
            let label=document.getElementById('capture-train-label');if(!label){label=document.createElement('div');label.id='capture-train-label';label.style.cssText='position:fixed;top:54px;right:16px;padding:10px;background:#fff;color:#172430;font:16px monospace;z-index:999';document.body.append(label);}
            label.textContent=${JSON.stringify(`Recorded train ${plan.trainId} · ${frame.description} · Gasworks south final-coaches entry · fixed exterior camera`)}+' · '+new Date(k.feed.timeMs).toISOString();
            window.__signalFrame(${frame.timeMs-session.start});
            return {id:t.id,description:t.description,kind:t.kind,timeMs:k.feed.timeMs,point:v.leading.point,speedMps:v.speed,state:v.state,reversals:v.reversals,lengthM:v.lengthM,
              rendered:t.group.userData.captureDraws>0,occupied:v.occupied.map(s=>({a:s.edge.a,b:s.edge.b,fromT:s.fromT,toT:s.toT,edgeLengthM:s.edge.length})),camera,visibility,
              signalCounts:k.signals?.counts()??null,trainsDrawn:k.trains.length};
          })()`)),
          picture:(frame,actual)=>phase('portal-png-buffer',()=>picture(async()=>{
            const after=await evaluate(`(()=>{const k=window.__kx,v=k.motionState.find(t=>t.id===${plan.trainId});return {timeMs:k.feed.timeMs,point:v?.leading.point,camera:k.camera.position.toArray()};})()`);
            if(after.timeMs!==frame.timeMs||Math.hypot(after.point[0]-frame.point[0],after.point[1]-frame.point[1])>.05||after.camera.some((v,i)=>Math.abs(v-actual.camera.position[i])>1e-6))throw new Error('clock, train or fixed camera moved during portal PNG capture');
          })),
          publish:async(frame,actual,bytes)=>{
            const i=plan.frames.indexOf(frame),file=`recording-${plan.recordingIndex}-${plan.direction}-train-${plan.trainId}-frame-${i}.png`;
            const metadata={...plan,frames:undefined,frame:{frame:i,...actual},...session,input:inputs.recordings[plan.recordingIndex],anchors:inputs.anchors,sclass:tableInput,
              cutaway:'shed and city hidden; other trains, track, platforms, terrain, portals and signals retained; label identifies the physical train',
              visibilityScope:'One fixed close near-axis camera during the final coaches entering; all-coach surface rays measure decreasing visible body length. Outside body must stay visible, buried body past the recess must be concealed, and frame 0 shows the aperture and real track continuing inside.',camera:actual.camera};
            await phase('portal-publish',()=>publish(file,metadata,bytes));return file;
          },
        });
        return {...captured,url:session.url};
      }
      const captures=[],files=[],attempts=[];let preferredView=0,session;
      for(const [i,frame] of plan.frames.entries()) {
        session=await replay.at(plan.recordingIndex,frame.timeMs);
        const inspected=await phase('follow-camera-and-raycast',()=>evaluate(`(()=>{
          const k=window.__kx,t=k.trains.find(t=>t.id===${plan.trainId}),v=k.motionState.find(t=>t.id===${plan.trainId}),{T,F}=window.__trainCapture;
          if(!t||!v)throw new Error('planned train not drawn');
          const attempts=[];let selected;
          for(const candidate of [${preferredView},...Array.from({length:6},(_,i)=>i).filter(i=>i!==${preferredView})]){
            const follow=F.followTrainCamera(T,k.camera,k.controls,t.group,v.leading.point,k.parts.terrain,candidate);
            t.group.userData.captureDraws=0;t.group.traverse(o=>{if(o.isMesh)o.onAfterRender=()=>t.group.userData.captureDraws++;});
            window.__signalFrame(${frame.timeMs-session.start});
            const visibility=F.inspectTrainFrame(T,k.scene,k.camera,follow.coach,k.parts.terrain,{minScreenSpan:.3,minVerticalSpan:.08});
            if(visibility.clear){selected={candidate,camera:follow.camera,visibility};break;}
            attempts.push({candidate,camera:follow.camera,...visibility});
          }
          if(!selected)return {failure:{message:'no clear close follow view of leading coach',details:attempts}};
          if(window.__trainMarker)k.scene.remove(window.__trainMarker);const marker=new T.Box3Helper(F.trainBounds(T,t.group.getObjectByName(selected.camera.focusCoach)||t.group),0xffd44a);
          // The selected coach name is local to this physical train, never a same-named coach in another consist.
          window.__trainMarker=marker;k.scene.add(marker);
          let label=document.getElementById('capture-train-label');if(!label){label=document.createElement('div');label.id='capture-train-label';label.style.cssText='position:fixed;top:54px;right:16px;padding:10px;background:#fff;color:#172430;font:16px monospace;z-index:999';document.body.append(label);}
          label.textContent=${JSON.stringify(`Recorded train ${plan.trainId} · ${frame.description} · ${plan.direction} · platform ${plan.platform}`)}+' · '+new Date(k.feed.timeMs).toISOString();
          window.__signalFrame(${frame.timeMs-session.start});
          return {id:t.id,description:t.description,kind:t.kind,timeMs:k.feed.timeMs,point:v.leading.point,speedMps:v.speed,state:v.state,reversals:v.reversals,lengthM:v.lengthM,rendered:t.group.userData.captureDraws>0,occupied:v.occupied.map(s=>({a:s.edge.a,b:s.edge.b,fromT:s.fromT,toT:s.toT,edgeLengthM:s.edge.length})),...selected,attempts,signalCounts:k.signals?.counts()??null,trainsDrawn:k.trains.length};
        })()`));
        checkedCaptureView(inspected);verifyReplayFrame(plan,frame,inspected);preferredView=inspected.candidate;attempts.push(...inspected.attempts);captures.push({frame:i,...inspected});
        const file=`recording-${plan.recordingIndex}-${plan.direction}-train-${plan.trainId}-frame-${i}.png`;
        const metadata={...plan,frames:undefined,frame:captures.at(-1),...session,input:inputs.recordings[plan.recordingIndex],anchors:inputs.anchors,sclass:tableInput,
          cutaway:'shed and city hidden; target leading coach highlighted; all other trains, track, platforms, terrain, portals and signals retained',camera:inspected.camera};
        await save(file,metadata,async()=>{
          const after=await evaluate(`(()=>{const k=window.__kx,v=k.motionState.find(t=>t.id===${plan.trainId});return {timeMs:k.feed.timeMs,point:v?.leading.point,camera:k.camera.position.toArray()};})()`);
          if(after.timeMs!==frame.timeMs||Math.hypot(after.point[0]-frame.point[0],after.point[1]-frame.point[1])>.05||after.camera.some((v,i)=>Math.abs(v-inspected.camera.position[i])>1e-6))throw new Error('clock, train or camera moved during PNG capture');
        });files.push(file);
      }
      return {...plan,frames:captures,files,attempts,url:session.url};
    },()=>lifetime.check());
    // Catalogue specimens reuse the existing built scene; changing a kind never reloads or replays a day.
    if(!currentSession)await replay.at(0,starts[0]);
    for(const kind of portalMode?[]:kinds) {
      lifetime.check();const failures=[];let done=false;
      const cars=dimensions.kinds.find(k=>k.kind===kind).cars,length=cars[0].model.vehicleLengthM;
      tracks:for(const track of catalogueTracks(graph,length).slice(0,12))for(const side of [1,-1]){
        if(done)break tracks;
        try{
          const view=await phase('coach-detail-and-raycast',()=>evaluate(`(()=>{const k=window.__kx,{T,F}=window.__trainCapture;if(window.__catalogue)k.scene.remove(window.__catalogue);if(window.__trainMarker)k.scene.remove(window.__trainMarker);const cache=window.__catalogueKinds??=new Map();if(!cache.has(${JSON.stringify(kind)}))cache.set(${JSON.stringify(kind)},k.evidenceBuildTrain(${JSON.stringify(kind)}));const g=cache.get(${JSON.stringify(kind)});window.__catalogue=g;k.scene.add(g);for(const t of k.trains)t.group.visible=false;for(const c of g.children)c.visible=c.name==='car-0';g.position.set(${track.point[0]},0,${track.point[1]});g.rotation.y=${track.rotationY};g.userData.captureDraws=0;g.traverse(o=>{if(o.isMesh)o.onAfterRender=()=>g.userData.captureDraws++;});const c=g.getObjectByName('car-0'),b=c.getObjectByName('bogie-0-0');if(!b)throw new Error('coach bogie missing');const view=F.detailCamera(T,k.scene,k.camera,k.controls,c,k.parts.terrain,[0,1.85,b.position.z],${side});const label=document.getElementById('capture-train-label');if(label)label.textContent=${JSON.stringify(`${kind} · catalogue coach detail · 3 m from body side`)};window.__signalFrame(k.feed.timeMs-${currentSession.start});window.__catalogueView=view;return {...view,rendered:g.userData.captureDraws>0};})()`));
          if(!view.rendered)throw new Error('catalogue coach not rendered');
          const metadata={kind,coach:0,mode:'catalogue specimen, not an identified recorded service',distanceM:view.distanceM,detail:'3 m from body side at leading bogie: local coach detail, not whole-car framing',track,view,renderer:currentSession.renderer,dimensions:cars[0],cutaway:'shed/city and replay train bodies hidden for catalogue inspection only; signals, terrain, track and portals retained'};
          const file=`coach-${kind}-3m.png`;await save(file,metadata,async()=>{const rendered=await evaluate('window.__catalogue.userData.captureDraws>0');if(!rendered)throw new Error('catalogue coach ceased rendering');});closeups.push({file,...metadata});done=true;
        }catch(error){lifetime.check();failures.push({track,side,reason:error.message,details:error.details??null});}
      }
      if(!done)failedCloseups.push({kind,failures});
    }
  }catch(error){fatal={reason:error.message,details:error.details??null};}
  finally{cdp?.close();cleanup=await cleanupCaptureBrowser(chrome,profile);lifetime.dispose();server?.closeAllConnections();if(server?.listening)await new Promise(r=>server.close(r));}
  const missing=motionResult?.missing??requirements;
  const result={motion:motionResult,closeups,failedCloseups,missingKinds:portalMode?[]:kinds.filter(k=>!closeups.some(c=>c.kind===k)),cleanup,inputs,sclass:tableInput,pack:reportFile,fatal,stopped:lifetime.reason(),requests,timings,
    timingTotalsMs:Object.fromEntries([...new Set(timings.map(t=>t.phase))].map(p=>[p,timings.filter(t=>t.phase===p).reduce((n,t)=>n+t.elapsedMs,0)])),
    limits:{timeoutMs,candidatesPerRequirement:6,camerasPerFrame:6,coachTrackCandidates:12},anchorCounts:{anchored:anchors.anchors.length,unmapped:anchors.unmapped.length},
    limitations:[portalMode?'Recorded portal entry covers the final 40 m (or 60% of a shorter formation) of exterior body entering from one fixed close near-axis camera. Per-coach surface rays measure visibility, require exterior body to remain visible, and reject deep body showing through the cover. Frame 0 also requires visible track through the aperture; no geometry is altered.':'Leading-coach follow cameras show approximately two to three car lengths; remaining train bodies remain drawn and may be outside the image.',
      'Architectural cutaways are named in each sidecar; terrain, track, portals and other trains remain visible and ray-tested.',
      ...(portalMode?[]:['Coach shots are staged catalogue specimens at 3 m from a body-side detail, not identified recorded services.']),
      'Normal page replay advances directly on its injected frame clock. Each recording is loaded only when changed or rewinding; no future steps or synthetic train positions are injected.',
      `Signals remain enabled; absence of a supplied frozen S-class table is honestly unknown. ${schedulePolicy.dates.length
        ? `Frozen schedule dates ${schedulePolicy.dates.join(', ')} determine formations at physical birth.`
        : 'No frozen schedule supplied; the endpoint remains 404 and page headcode fallback preserves audited formation births.'}`]};
  await writeFile(path.join(out,'captures.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({sequences:motionResult?.shots.length??0,missing,closeups:closeups.length,missingKinds:result.missingKinds,cleanup,fatal,timingTotalsMs:result.timingTotalsMs,out}));
  process.exitCode=lifetime.reason()?process.exitCode:missing.length||result.missingKinds.length||fatal?1:0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.stack??e.message);process.exitCode=1;});

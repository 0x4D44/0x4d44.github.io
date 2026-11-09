// GPU rubric evidence, from the exact frozen inputs of axis05-evidence. Import-safe preflight.
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {createServer} from 'node:http';
import {readFile,writeFile,realpath,mkdir,mkdtemp,stat,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {manualFrames,cdpPipe} from './signal-capture.mjs';
import {createCaptureLifetime,cleanupCaptureBrowser} from './capture-runtime.mjs';
import {ALL_KINDS,FIGURES,EMU_FIGURES,trainLayout} from '../core/train.ts';
import {bodySpec,carPlan} from '../web/src/train.ts';
import {shedLayout,shedBufferStops,standingTrainPose,stationPlatforms,pointInPolygon,worldToShed} from '../core/station.ts';
import {PLATFORM_HEIGHT} from '../core/scene.ts';
import {readPng} from './axis01-pixels.mjs';
import {CATALOGUE,STAGE_VIEWS,STATION_ORIENTATIONS,VIEW_IDS,failureSummary,planCatalogueViews,planStation,poseOf,poseDifference,stationFrozenDrift,stationViewsFromFrozen,stationViewsFromSearch} from './train-framing.mjs';
import {tunnelMouths} from '../core/landmarks.ts';
import {buildGraph} from '../core/graph.ts';
import {createMotion} from '../core/motion.ts';
import {createTrainKinds} from '../web/src/trains-live.ts';
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
 * Where the model's one car pattern stands for more than one class. The LNER Class 800 (bi-mode) and 801 (electric) share the AT300 car shape, and the model
 * draws that one pattern: no underfloor engines, one roof/pantograph arrangement. So a picture of an LNER kind must not be read as either variant. The other
 * kinds stand for one class (or one class family) and carry no note.
 */
const LNER_CLASS_NOTE='the model draws the car pattern shared by these classes; it does not distinguish the bi-mode 800 from the electric 801 (no underfloor engines, one roof/pantograph pattern); it is not claimed to match either variant';
export const CLASS_NOTES=Object.freeze({lner5:LNER_CLASS_NOTE,lner9:LNER_CLASS_NOTE});
/** The formation block of a manifest entry: the family, the classes and the note on them, the length, the dimensions and the cars. */
export const manifestFormation=formation=>({family:formation.family,classes:formation.classes,classNote:formation.classNote,lengthM:formation.length,dimensions:formation.dimensions,cars:formation.cars});
/** A plain description of one kind's formation: the input of planCatalogueViews and the sidecars' `formation`/`dimensions`. */
export function describeFormation(kind) {
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
 */
export async function loadStationScene(file=fileURLToPath(new URL('../web/src/data/kx-track.json',import.meta.url))) {
  if(PLATFORM_HEIGHT!==CATALOGUE.platformHeightM)throw new Error(`the page's platform height is ${PLATFORM_HEIGHT} m but the catalogue says ${CATALOGUE.platformHeightM} m`);
  const bytes=await readFile(file),data=JSON.parse(bytes.toString('utf8')),layout=shedLayout(data);
  const stops=shedBufferStops(data,layout).sort((p,q)=>worldToShed(layout,[p.x,p.z]).u-worldToShed(layout,[q.x,q.z]).u);
  return {heading:layout.heading,stops,platforms:[...stationPlatforms(data)].map(([ref,p])=>({ref,pts:p.pts})),inside:pointInPolygon,
    standing:stop=>standingTrainPose(layout,stop,CATALOGUE.noseToStopM),file,sha256:sha256(bytes)};
}
/** What every V10 view of a run shares, for the manifest: the data it was placed from and the search limits. */
export function stationManifest(scene) {
  return {trackData:{file:'kings-cross-src/web/src/data/kx-track.json',sha256:scene.sha256},heading:scene.heading,stopIndex:CATALOGUE.stationStopIndex,stop:scene.stops[CATALOGUE.stationStopIndex]??null,
    platforms:scene.platforms.map(p=>p.ref),orientations:STATION_ORIENTATIONS,platformHeightM:PLATFORM_HEIGHT,eyeAbovePlatformM:CATALOGUE.eyeAbovePlatformM,noseToStopM:CATALOGUE.noseToStopM,
    search:{azimuthStepDeg:1,maxCandidates:CATALOGUE.stationMaxCandidates,minSeparationDeg:CATALOGUE.stationMinSeparationDeg,edgeClearM:CATALOGUE.platformEdgeClearM,frontAngleDeg:CATALOGUE.stationFrontAngleDeg,minScreenSpan:CATALOGUE.stationMinScreenSpan,passes:['spread','neighbour']},
    rule:'The specimen stands at one real buffer stop, nose at the buffers first, then turned so the leading cab is at the north end. For each view the cameras that lie exactly D m from the focus over a platform are tried in two passes, each best first (nearest a front three-quarter view): first the spread (none within minSeparationDeg of azimuth of another, at most maxCandidates), then every other such position, the neighbours the thinning dropped; the first whose check is clear is accepted, and a view is a GAP only when all of them were tried; the first placement with all six clear is kept, else the one with most. Poses are then frozen.'};
}

export const CATALOGUE_TIMEOUT_S={default:1800,max:3600};
const CATALOGUE_FLAGS=['--mode','--dist','--out','--kinds','--views','--chrome','--poses','--exposure','--timeout-seconds'];
/** `--mode catalogue --dist <dist> --out <dir> [--kinds a,b] [--views V01,V04] [--chrome none|path] [--poses <manifest>] [--exposure day|dusk] [--timeout-seconds N]`. */
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
  const list=(name,allowed)=>{
    if(!options.has(name))return [...allowed];
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
  return {dist:options.get('--dist'),out:options.get('--out'),kinds:list('--kinds',ALL_KINDS),views:list('--views',VIEW_IDS),chrome:options.get('--chrome')??null,poses:options.get('--poses')??null,exposure,timeoutMs:seconds*1000};
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
 * retried, and not replaced by another pose. A view the model plan already marked GAP or N/A is passed through. A thrown error is a defect in the
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
      const entry=held.views?.[view.suffix];
      if(!entry?.plan){drifts.push({kind,view:view.suffix,reason:'view missing from the frozen poses'});continue;}
      const at=poseDifference(poseOf(view),entry.plan,tol);
      if(at!==null)drifts.push({kind,view:view.suffix,reason:'pose differs from the frozen pose',at});
    }
    if(plan.station)for(const d of stationFrozenDrift(plan.station,held,{tol}))drifts.push({kind,...d});
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
  const sceneChildren=()=>k.scene.children.map(o=>({name:o.name||'',type:o.type,visible:o.visible}));
  cat.begin=(kind,length)=>{
    const {T,F}=cat;
    if(cat.state)throw new Error('a specimen is already on stage');
    const group=k.evidenceBuildTrain(kind),hidden=F.hideSceneryForStage(k.scene),stage=F.buildCatalogueStage(T,{length});
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
    return {pose,inspection,info,costs:F.trainCosts(s.group),placement:{position:s.group.position.toArray(),rotationY:s.group.rotation.y},labelText:text,chrome,atmosphere:atmosphereOf()};
  };
  cat.view=(view,text)=>{
    const {T,F}=cat,s=cat.state;
    F.placeStageSpecimen(s.group,s.stage,view.rotation.rotationY);
    const pose=F.setCatalogueView(T,k.camera,k.controls,s.group,view);
    if(view.capability){if(typeof k.setTrainLampState!=='function')throw new Error('the page lost setTrainLampState during the run');k.setTrainLampState(s.group,view.capability.state);}
    return settle(view,text,pose);
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
 */
export const EXPOSURES=Object.freeze({
  day:Object.freeze({id:'day',query:'sky=ref',rig:'fixed',pinnedTime:null,pinnedWeather:null}),
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
 * The lamp level the page gives the trains' windows and lenses, and where it was read: the atmosphere's rig sets `trainNight.value` to its `lampLevel` (web/src/atmosphere.ts apply).
 * The fixed day rig has no atmosphere, so nothing ever sets it and it keeps its initial 0 (web/src/train-geom.ts); that is inferred from the code, not read from the page.
 */
export function trainNightOf(exposure,atmosphere) {
  if(atmosphere)return {trainNight:atmosphere.rig.lampLevel,trainNightSource:'the page atmosphere: rig.lampLevel, which atmosphere.ts apply copies to trainNight.value'};
  if(exposure.rig==='fixed')return {trainNight:0,trainNightSource:'inferred: the fixed rig has no atmosphere, so trainNight keeps its initial 0 (web/src/train-geom.ts)'};
  return {trainNight:null,trainNightSource:'unavailable: the page gave no atmosphere state'};
}

/** The sidecar of one picture: everything needed to reproduce it and to judge it without opening the page. */
export function catalogueSidecar({kind,view,file,formation,session,host,build,state,result,timings,exposure=exposureRecord('day')}) {
  const live=result.live;
  return {rubric:CATALOGUE.rubric,schema:'kx-catalogue-sidecar/1',kind,file,
    view:{id:view.id,suffix:view.suffix,frame:view.frame,notes:view.notes,car:view.car??null,capability:view.capability??null},
    renderer:session.renderer,host:host.os,macModel:host.macModel,git:host.git,build,
    viewport:{width:CATALOGUE.viewport.width,height:CATALOGUE.viewport.height,deviceScaleFactor:CATALOGUE.viewport.deviceScaleFactor,
      canvas:session.size,devicePixelRatio:session.devicePixelRatio},
    // the exposure is what the page was pinned to; `atmosphere` is the page's own state at this frame (null under the fixed day rig), and `trainNight` the lamp level it gives
    // the trains' windows and lenses (web/src/atmosphere.ts apply: trainNight.value = rig.lampLevel)
    renderState:{toneMapping:session.toneMapping,toneMappingExposure:session.toneMappingExposure,outputColorSpace:session.outputColorSpace,background:session.background,fog:session.fog,lights:session.lights,
      exposure:exposure.id,urlQuery:exposure.urlQuery,rig:exposure.rig,pinnedTime:exposure.pinnedTime,pinnedWeather:exposure.pinnedWeather,
      atmosphere:live.atmosphere??null,...trainNightOf(exposure,live.atmosphere??null),lampApi:session.lampApi===true},
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
export function catalogueManifest({exposure,stationScene,host,build,poses,generated=new Date().toISOString()}) {
  return {rubric:CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',generated,viewport:CATALOGUE.viewport,
    sunRule:{id:'sun-bearing-v1',sunPosition:CATALOGUE.sunPosition,offsetDeg:CATALOGUE.sunOffsetDeg,
      text:"Each view's specimen is turned about the vertical axis so the camera's bearing from the focus point is within 15 degrees of the page sun's azimuth, the sun nudged toward the specimen's nearest lateral axis (plan view: the upper-left diagonal). A pure function of the view's train-local pose. It always uses the day rig's sun, in every exposure, so a dusk pass turns each specimen exactly as the day pass did."},
    station:stationScene?stationManifest(stationScene):null,exposure:exposureRecord(exposure),
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

export async function catalogueMain(args) {
  const opts=parseCatalogueArgs(args),root=ROOT,scratch=await realpath(path.join(root,'.scratch'));
  if(opts.exposure!=='day'&&!opts.poses)throw new Error(`--exposure ${opts.exposure} reuses the poses of a day pass, so poses cannot change between exposures: give --poses <the day pass's catalogue-manifest.json>`);
  const dist=await realpath(path.resolve(opts.dist)),out=path.resolve(opts.out);
  const inside=p=>{const r=path.relative(scratch,p);return !r.startsWith('..')&&!path.isAbsolute(r);};
  if(!inside(out)||out===scratch)throw new Error('--out must be under worktree .scratch');
  for(let parent=out;;) {try{if(!inside(await realpath(parent)))throw new Error('output symlink escapes .scratch');break;}catch(e){if(e.code!=='ENOENT')throw e;parent=path.dirname(parent);}}
  const stageIds=opts.views.filter(id=>id!=='V10'),stationScene=opts.views.includes('V10')?await loadStationScene():null;
  const plans=new Map(opts.kinds.map(kind=>{const formation=describeFormation(kind);
    return [kind,{kind,formation,views:planCatalogueViews(formation).filter(v=>stageIds.includes(v.id)),station:stationScene?planStation(formation,stationScene):null}];}));
  let frozen=null,frozenSha=null;
  if(opts.poses) {
    const bytes=await readFile(path.resolve(opts.poses));frozen=loadFrozenPoses(bytes.toString('utf8'));frozenSha=sha256(bytes);
    const drifts=frozenPoseDrift(frozen,plans);
    if(drifts.length)throw new Error(`refusing to capture: ${drifts.length} pose(s) differ from ${opts.poses}: ${drifts.slice(0,8).map(d=>`${d.kind}/${d.view??'*'} ${d.reason}${d.at?` at ${d.at}`:''}`).join('; ')}`);
    for(const plan of plans.values()){
      plan.views=plan.views.map(v=>freezeView(v,frozen.kinds[plan.kind].views[v.suffix]));
      if(plan.station)plan.stationViews=stationViewsFromFrozen(plan.station,frozen.kinds[plan.kind]);
    }
  }
  const counts=Object.fromEntries([...plans].map(([kind,plan])=>[kind,[...plan.views,...(plan.stationViews??plan.station?.views??[])].reduce((n,v)=>({...n,[v.status]:(n[v.status]??0)+1}),{})]));
  if(opts.chrome==='none'){console.log(JSON.stringify({catalogue:true,rubric:CATALOGUE.rubric,kinds:opts.kinds,views:opts.views,exposure:opts.exposure,posesFrozen:!!frozen,planned:counts}));return;}
  const chromePath=opts.chrome??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';await stat(chromePath);
  await mkdir(out,{recursive:true});
  const host=hostInfo(),build=await buildHash(dist),started=performance.now();
  let chrome,cdp,profile,server,cleanup,fatal,session;
  const lifetime=createCaptureLifetime({timeoutMs:opts.timeoutMs,onStop:()=>cdp?.close()});
  const manifest=catalogueManifest({exposure:opts.exposure,stationScene,host,build,poses:frozen?{file:path.resolve(opts.poses),sha256:frozenSha}:null});
  const summary={kinds:{},timingsMs:{}};
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
    await evaluate(`(${catalogueDriver.toString()})()`);
    Object.assign(manifest.exposure,{atmosphere:await evaluate('window.__cat.atmosphere()')});
    const shoot=async()=>Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64');
    const publish=async(file,bytes,sidecar)=>{await writeFile(path.join(out,file),bytes,{flag:'wx',mode:0o600});await writeFile(path.join(out,file+'.json'),JSON.stringify(sidecar,null,2)+'\n',{flag:'wx',mode:0o600});return file;};
    // the views of one specimen already on stage: check, photograph (with the empty-stage baseline), verify the pixels, write the picture and its sidecar
    const captureViews=async(kind,plan,views,state)=>{
      const live=new Map();
      return runCatalogueViews(views,{
        check:()=>lifetime.check(),
        unavailable:view=>view.capability&&!session.lampApi?view.capability.reason:null,
        inspect:async view=>{
          const station=view.id==='V10',text=`${kind} catalogue specimen ${station?"at King's Cross, station scenery kept":'on neutral stage'} - ${view.id} ${view.suffix}`;
          const r=await evaluate(`window.__cat.${station?'stationView':'view'}(${JSON.stringify(view)},${JSON.stringify(text)})`);live.set(view,r);return r.inspection;
        },
        shoot:view=>photograph({evaluate,screenshot:shoot,view}),
        verify:async(view,picture,inspection)=>{const diff=pixelDiff(picture.shot,picture.baseline);return pixelVerdict(view,diff,picture.subject?pixelDiff(picture.subject,picture.baseline):diff,inspection);},
        publish:async(view,picture,inspection,verdict,timingsMs)=>{
          const file=`${kind}-${view.suffix}.png`;
          return publish(file,picture.shot,catalogueSidecar({kind,view,file,formation:plan.formation,session,host,build,state,result:{verdict,live:live.get(view)},timings:timingsMs,exposure:manifest.exposure}));
        },
      });
    };
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
          if(!views){
            const report=await evaluate(`window.__cat.stationSearch(${JSON.stringify(plan.station.placements)})`);
            views=stationViewsFromSearch(plan.station,report);
            // every placement the search tried, with what it found view by view (the manifest keeps the chosen placement's detail)
            summary.stationSearch??={};summary.stationSearch[kind]=report.map(r=>({placement:r.placementId,clear:r.clear,
              views:Object.fromEntries(Object.entries(r.views).map(([s,v])=>[s,{tested:v.tested,acceptedAzimuthDeg:v.accepted?.azimuthDeg??null,failures:failureSummary(v.tried)}]))}));
          }
          for(const r of await captureViews(kind,plan,views,state))entries[r.view.suffix]=manifestEntry(r);
        } finally {await evaluate('window.__cat.end()');}
      }
      manifest.kinds[kind]={formation:manifestFormation(plan.formation),views:entries};
      const tally={};for(const e of Object.values(entries))tally[e.outcome.status]=(tally[e.outcome.status]??0)+1;
      summary.kinds[kind]=tally;summary.timingsMs[kind]=Math.round(performance.now()-kindStart);
      console.log(`${kind}: ${JSON.stringify(tally)} in ${(summary.timingsMs[kind]/1000).toFixed(1)} s`);
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
  return {id:view.id,suffix:view.suffix,plan:poseOf(view),rotation:view.rotation??null,notes:view.notes??null,car:view.car??null,capability:view.capability??null,
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

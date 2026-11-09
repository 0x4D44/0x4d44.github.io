// GPU rubric evidence, from the exact frozen inputs of axis05-evidence. Import-safe preflight.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,realpath,mkdir,mkdtemp,stat,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {manualFrames,cdpPipe} from './signal-capture.mjs';
import {createCaptureLifetime,cleanupCaptureBrowser} from './capture-runtime.mjs';
import {ALL_KINDS} from '../core/train.ts';
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
export async function main(args=process.argv.slice(2)) {
  const options=new Map();for(let i=0;i<args.length;i+=2){if(!['--motion','--dimensions','--dist','--out','--chrome','--sclass','--timeout-seconds','--mode'].includes(args[i])||!args[i+1]||options.has(args[i]))throw new Error('usage: train-capture.mjs --motion <axis05.json> --dimensions <axis03.json> --dist <dist> --out <.scratch/shots> [--mode portal] [--chrome none|path]');options.set(args[i],args[i+1]);}
  const required=n=>{if(!options.has(n))throw new Error(`missing ${n}`);return path.resolve(options.get(n));};
  const root=ROOT,scratch=await realpath(path.join(root,'.scratch'));
  const reportFile=required('--motion');let report=JSON.parse(await readFile(reportFile,'utf8')),dimensions=JSON.parse(await readFile(required('--dimensions'),'utf8'));
  const portalMode=options.get('--mode')==='portal';if(options.has('--mode')&&!portalMode)throw new Error('--mode must be portal');
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
    chrome=spawn(chromePath,['--headless=new','--remote-debugging-pipe',`--user-data-dir=${profile}`,'--no-sandbox','--no-first-run','--no-default-browser-check','--disable-breakpad','--disable-crash-reporter','--noerrdialogs','--use-mock-keychain','--password-store=basic','--no-proxy-server','--ignore-gpu-blocklist','--use-angle=metal','--enable-gpu-rasterization','about:blank'],{detached:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
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

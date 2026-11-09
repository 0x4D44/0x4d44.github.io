import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { planBuilding } from '../../core/city.ts';
import { shedBufferStops, shedLayout, shedToWorld, standingTrainPose, worldToShed } from '../../core/station.ts';
import { trainLayout } from '../../core/train.ts';
import { WESTERN_RANGE } from '../../web/src/shed.ts';
import { lensFor } from '../station-scene.mjs';
import { AXES, ELEMENT_VIEWS, LIGHTING_NOTE, WESTERN_RANGE_STANDOFF, cameraBuildingCollisions, cityBuildings, cdpPipe, createEvidenceServer, commandResult, lightingFingerprint, lightingProbe, optionsFrom, prepareEvidenceScene, proxyTarget, realMetal, relayUrl, resolveViews, runStationEvidenceShots, safeFile, safeOutputDirectory, searchSignalStates, signalReplayWindow, signalStateTarget, signalStateCamera, setSignalDetailBoardVisibility, stationViewNames, stationWorld, writePrivateFile, runAxis04Reports, stationCameras, trainCameras, within } from '../evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const scratch = path.join(root, '.scratch/evidence13-tests');
await mkdir(scratch, { recursive: true });

test('evidence options reject unsafe relay origins dates speeds and output paths', () => {
  for (const value of ['https://outside.invalid', 'file:///tmp/relay', 'http://fake:secret@127.0.0.1:8787', 'http://127.0.0.1/path']) assert.throws(() => relayUrl(value));
  assert.equal(relayUrl('http://127.0.0.1:8787').origin, 'http://127.0.0.1:8787');
  for (const args of [['--date','20260230'], ['--date','2026010/'], ['--speed','0'], ['--speed','NaN'], ['--signal-at','25:00:00'], ['--out', root], ['--out', `${scratch}/../../../escape`], ['--dist'], ['--wat']]) assert.throws(()=>optionsFrom(args));
  const o = optionsFrom(['--gpu', '--date', '20261109', '--speed','8', '--out',scratch]);
  assert.equal(o.gpu,true); assert.equal(o.date,'20261109'); assert.equal(o.speed,8);
  assert.equal(optionsFrom([]).rawOsm,path.join(os.homedir(),'kx-data/osm/kx-osm.json'));
});

test('live-window options are bounded, integral, and require a relay', () => {
  const relay='http://127.0.0.1:8787';
  for(const value of ['0','-1','3601','1.5','NaN']) assert.throws(()=>optionsFrom(['--live-window',value,'--relay',relay]));
  assert.throws(()=>optionsFrom(['--live-window','30']));
  assert.throws(()=>optionsFrom(['--live-window','30','--relay',relay,'--live-report','capture.json']));
  assert.equal(optionsFrom(['--live-window','1','--relay',relay]).liveWindow,1);
  assert.equal(optionsFrom(['--live-window','3600','--relay',relay]).liveWindow,3600);
  assert.equal(optionsFrom(['--live-report','capture.json']).liveReport,path.resolve('capture.json'));
});

function syntheticAxis04() {
  return { axes: ['04','05','06','07'].map(id=>({id,artifacts:[],gaps:[]})), gaps:[], commands:[] };
}
function syntheticFetch({missingSchedule=false}={}) {
  const calls=[];
  const fetchImpl=async url=>{
    const parsed=new URL(url); calls.push(parsed.href);
    if(parsed.pathname==='/schedule') return missingSchedule
      ? new Response('missing',{status:404})
      : new Response(JSON.stringify({date:parsed.searchParams.get('date'),calls:[{uid:'svc-1',headcode:'1A23'}]}));
    if(parsed.pathname==='/anchors') return new Response('{"area":"kx"}');
    if(parsed.pathname==='/recording') return new Response('{"t":1794052800000,"e":{"kind":"snapshot","area":"kx","berths":{}}}\n');
    if(parsed.pathname==='/sclass') return new Response('{}');
    throw new Error(`unexpected synthetic endpoint ${parsed.pathname}`);
  };
  return {fetchImpl,calls};
}
function syntheticBoardReport() {
  return {summary:{movements:1,fullyObserved:1,boardAgreement:0,agreementPercent:0,medianLagSeconds:null,medianAbsoluteLagSeconds:null,disagreements:1},
    hourly:[{fromISO:'2026-11-07T12:00:00.000Z',toISO:'2026-11-07T13:00:00.000Z',summary:{movements:1,agreementPercent:0,medianLagSeconds:null},scheduleMatch:{matchedHeadcodes:1,observedHeadcodes:1}}],
    scheduleMatch:{observedHeadcodes:1,matchedHeadcodes:1,percent:100,unmatchedHeadcodes:[],observedIntervals:1,matchedIntervals:1,intervalPercent:100},
    results:[{actualMs:1794052800000,headcode:'1A23',eventType:'step',platform:'2',bookedPlatform:'3',fullyObserved:true,agreed:false,observation:null,reasons:['headcode absent from observed board sections within tolerance']}]};
}
function syntheticLiveReport(startMs=Date.parse('2026-11-07T12:00:00Z'),endMs=Date.parse('2026-11-07T12:00:30Z')) {
  return {interval:{startMs,endMs,durationSeconds:(endMs-startMs)/1000,startMode:'checkpoint'},passed:true,samples:31,positionDifferenceM:{median:0,p95:1,max:2}};
}
function syntheticRunner(report, calls, {liveReport=syntheticLiveReport()}={}) {
  return async (axis,name,command,args,timeoutMs=300000)=>{
    calls.push({axis,name,command,args,timeoutMs});
    const value=(key)=>args[args.indexOf(key)+1];
    if(name==='live-vs-replay'||name==='live-vs-replay-summary') {
      const dir=value('--out'); await mkdir(dir,{recursive:true});
      await writeFile(path.join(dir,'live-vs-replay.json'),JSON.stringify(liveReport)+'\n');
    }
    if(name==='board-vs-trust') {
      const dir=value('--out'); await mkdir(dir,{recursive:true});
      await writeFile(path.join(dir,'board-vs-trust.json'),JSON.stringify(syntheticBoardReport())+'\n');
      await writeFile(path.join(dir,'board-vs-trust.md'),'synthetic disagreement table\n');
    }
    if(name==='axis-04-summary') {
      const dir=value('--out'); await mkdir(dir,{recursive:true});
      await writeFile(path.join(dir,'axis-04-summary.json'),JSON.stringify({available:true})+'\n');
      await writeFile(path.join(dir,'axis-04-summary.md'),'synthetic summary\n');
    }
    return {code:0,timedOut:false};
  };
}
function syntheticGap(report) { return (axis,message)=>{report.axes.find(a=>a.id===axis).gaps.push(message);report.gaps.push(`${axis}: ${message}`);}; }

test('axis 04 synthetic run fetches dated timetable, forwards live interval, and writes private reports and disagreement summary', async()=>{
  const dir=await mkdtemp(path.join(scratch,'axis04-full-'));
  try {
    const out=path.join(dir,'pack'); await mkdir(out,{recursive:true});
    const report=syntheticAxis04(),{fetchImpl,calls:fetches}=syntheticFetch(),calls=[];
    const options={out,iso:'2026-11-07',date:'20261107',relay:relayUrl('http://127.0.0.1:8787'),liveWindow:30,liveReport:null};
    await runAxis04Reports(options,report,{fetchImpl,run:syntheticRunner(report,calls),gap:syntheticGap(report),checkHost:async()=>403});
    const requested=new URL(fetches.find(url=>new URL(url).pathname==='/schedule'));
    assert.equal(requested.searchParams.get('date'),'2026-11-07');
    const live=calls.find(call=>call.name==='live-vs-replay');
    assert.deepEqual(live.args.slice(live.args.indexOf('--seconds'),live.args.indexOf('--seconds')+2),['--seconds','30']);
    assert.ok(live.timeoutMs>=(30+610+45)*1000);
    const board=calls.find(call=>call.name==='board-vs-trust');
    assert.ok(board.args.includes('--hourly'));
    assert.deepEqual(board.args.slice(board.args.indexOf('--from'),board.args.indexOf('--to')+2),['--from','2026-11-07T12:00:00.000Z','--to','2026-11-07T12:00:30.000Z']);
    assert.ok(board.args.includes(path.join(out,'inputs','schedule-2026-11-07.json')));
    assert.ok(calls.find(call=>call.name==='axis-04-summary').args.includes('--board-report'));
    assert.ok(calls.find(call=>call.name==='axis-04-summary').args.includes('--live-report'));
    const boardJson=JSON.parse(await readFile(path.join(out,'board-vs-trust','board-vs-trust.json'),'utf8'));
    const schedule=JSON.parse(await readFile(path.join(out,'inputs','schedule-2026-11-07.json'),'utf8'));
    assert.equal(schedule.date,'2026-11-07');
    assert.deepEqual(report.axes.find(a=>a.id==='04').boardVsTrust.hourly,boardJson.hourly);
    assert.deepEqual(report.axes.find(a=>a.id==='04').boardVsTrust.scheduleMatch,boardJson.scheduleMatch);
    assert.deepEqual(report.axes.find(a=>a.id==='04').boardVsTrust.results,boardJson.results);
    assert.match(await readFile(path.join(out,'axis-04.md'),'utf8'),/headcode absent from observed board sections/);
    assert.match(await readFile(path.join(out,'axis-04.md'),'utf8'),/axis-04-summary\/axis-04-summary\.md/);
    assert.deepEqual(report.axes.find(a=>a.id==='04').gaps,[]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('missing dated timetable creates an axis 04 gap and still runs the summary generator', async()=>{
  const dir=await mkdtemp(path.join(scratch,'axis04-gap-'));
  try {
    const out=path.join(dir,'pack'); await mkdir(out,{recursive:true});
    const report=syntheticAxis04(),{fetchImpl}=syntheticFetch({missingSchedule:true}),calls=[];
    const options={out,iso:'2026-11-07',date:'20261107',relay:relayUrl('http://127.0.0.1:8787'),liveWindow:null,liveReport:null};
    await runAxis04Reports(options,report,{fetchImpl,run:syntheticRunner(report,calls),gap:syntheticGap(report),checkHost:async()=>403});
    assert.match(report.gaps.join('\n'),/No timetable for recording date 2026-11-07/);
    assert.equal(calls.some(call=>call.name==='board-vs-trust'),false);
    const summary=calls.find(call=>call.name==='axis-04-summary');
    assert.ok(summary); assert.equal(summary.args.includes('--board-report'),false);
    assert.match(await readFile(path.join(out,'axis-04.md'),'utf8'),/Agreement: unavailable/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('saved live reports are recomputed without capture and do not scope whole-date board agreement', async()=>{
  const dir=await mkdtemp(path.join(scratch,'axis04-reuse-'));
  try {
    const out=path.join(dir,'pack'),sourceDir=path.join(dir,'saved-live'),source=path.join(sourceDir,'live-vs-replay.json'); await mkdir(out,{recursive:true}); await mkdir(sourceDir,{recursive:true});
    const sample=[{atMs:1,trains:[{id:1,description:'1A23',edge:[1,2,3],t:.5,point:[0,0]}]}];
    await writeFile(path.join(sourceDir,'live-samples.json'),JSON.stringify(sample));
    await writeFile(path.join(sourceDir,'replay-samples.json'),JSON.stringify(sample));
    await writeFile(source,JSON.stringify(syntheticLiveReport(Date.parse('2026-11-08T00:05:00Z'),Date.parse('2026-11-08T00:05:30Z'))));
    const report=syntheticAxis04(),{fetchImpl}=syntheticFetch(),calls=[];
    const options={out,iso:'2026-11-07',date:'20261107',relay:relayUrl('http://127.0.0.1:8787'),liveWindow:null,liveReport:source};
    await runAxis04Reports(options,report,{fetchImpl,run:syntheticRunner(report,calls),gap:syntheticGap(report),checkHost:async()=>403});
    assert.equal(calls.some(call=>call.name==='live-vs-replay'),false);
    const summarize=calls.find(call=>call.name==='live-vs-replay-summary');
    assert.ok(summarize); assert.ok(summarize.args.includes(sourceDir));
    const board=calls.find(call=>call.name==='board-vs-trust');
    assert.ok(board); assert.equal(board.args.includes('--from'),false); assert.equal(board.args.includes('--to'),false);
    assert.ok(await readFile(path.join(out,'live-vs-replay','live-vs-replay.json'),'utf8'));
    assert.equal(report.gaps.some(gap=>gap.includes('does not match recording date')),false);
    assert.equal(report.axes.find(a=>a.id==='04').liveVsReplay.recomputable,true);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('non-recomputable saved live reports are linked with an explicit gap',async()=>{
  const dir=await mkdtemp(path.join(scratch,'axis04-noreplay-'));
  try {
    const out=path.join(dir,'pack'),source=path.join(dir,'saved-live.json'); await mkdir(out,{recursive:true});
    await writeFile(source,JSON.stringify(syntheticLiveReport()));
    const report=syntheticAxis04(),{fetchImpl}=syntheticFetch(),calls=[];
    const options={out,iso:'2026-11-07',date:'20261107',relay:relayUrl('http://127.0.0.1:8787'),liveWindow:null,liveReport:source};
    await runAxis04Reports(options,report,{fetchImpl,run:syntheticRunner(report,calls),gap:syntheticGap(report),checkHost:async()=>403});
    assert.match(report.gaps.join('\n'),/no live-samples\.json and replay-samples\.json/);
    assert.equal(report.axes.find(a=>a.id==='04').liveVsReplay.recomputable,false);
    assert.match(await readFile(path.join(out,'axis-04.md'),'utf8'),/JSON \(non-recomputable\)/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('failed child runs never promote stale board or live reports from a reused pack',async()=>{
  const dir=await mkdtemp(path.join(scratch,'axis04-stale-'));
  try {
    const out=path.join(dir,'pack'),boardOut=path.join(out,'board-vs-trust'),liveOut=path.join(out,'live-vs-replay');
    await mkdir(boardOut,{recursive:true}); await mkdir(liveOut,{recursive:true});
    await writeFile(path.join(boardOut,'board-vs-trust.json'),JSON.stringify(syntheticBoardReport()));
    await writeFile(path.join(liveOut,'live-vs-replay.json'),JSON.stringify(syntheticLiveReport()));
    const report=syntheticAxis04(),{fetchImpl}=syntheticFetch(),calls=[];
    const run=async(axis,name,command,args)=>{
      calls.push({axis,name,command,args});
      if(name==='live-vs-replay'||name==='board-vs-trust')return {code:2,timedOut:false};
      if(name==='axis-04-summary'){
        const destination=args[args.indexOf('--out')+1]; await mkdir(destination,{recursive:true});
        await writeFile(path.join(destination,'axis-04-summary.md'),'unavailable metrics\n');
        await writeFile(path.join(destination,'axis-04-summary.json'),'{}\n');
      }
      return {code:0,timedOut:false};
    };
    const options={out,iso:'2026-11-07',date:'20261107',relay:relayUrl('http://127.0.0.1:8787'),liveWindow:30,liveReport:null};
    await runAxis04Reports(options,report,{fetchImpl,run,gap:syntheticGap(report),checkHost:async()=>403});
    assert.equal(report.axes.find(a=>a.id==='04').liveVsReplay.json,null);
    assert.equal(report.axes.find(a=>a.id==='04').boardVsTrust.json,null);
    assert.equal(calls.find(call=>call.name==='axis-04-summary').args.includes('--board-report'),false);
    assert.equal(calls.find(call=>call.name==='axis-04-summary').args.includes('--live-report'),false);
    assert.match(report.gaps.join('\n'),/fresh valid live-vs-replay\/live-vs-replay\.json/);
    assert.match(report.gaps.join('\n'),/readable board-vs-trust\.json/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('only an actual Metal renderer qualifies for hardware evidence', () => {
  assert.equal(realMetal('ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)'),true);
  for (const renderer of ['unknown','SwiftShader','ANGLE Metal SwiftShader','llvmpipe Metal','Apple M3',null]) assert.equal(realMetal(renderer),false);
});

test('proxy paths preserve endpoint queries without accepting a client origin', () => {
  const relay = relayUrl('http://127.0.0.1:8787');
  assert.equal(proxyTarget(relay,'/relay/recording?date=20261109').href,'http://127.0.0.1:8787/recording?date=20261109');
  assert.equal(proxyTarget(relay,'/elsewhere'),null);
  assert.equal(proxyTarget(relay,'/relay/../outside'),null);
  assert.equal(within('/safe/root','/safe/root-sibling/a'),false);
});

test('static files refuse traversal malformed encoding and symlinks outside the mount', async () => {
  const dir = await mkdtemp(path.join(scratch,'static-'));
  try {
    await mkdir(path.join(dir,'public')); await writeFile(path.join(dir,'public','index.html'),'synthetic');
    await writeFile(path.join(dir,'private.txt'),'synthetic outside mount');
    await symlink(path.join(dir,'private.txt'), path.join(dir,'public','linked.txt'));
    assert.equal((await safeFile(path.join(dir,'public'),'/index.html')).body.toString(),'synthetic');
    for(const name of ['/../private.txt','/%2e%2e/private.txt','/%oops','/linked.txt']) assert.equal(await safeFile(path.join(dir,'public'),name),null);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('station cameras cover every requested landmark using finite world positions', async () => {
  const data = JSON.parse(await readFile(path.join(root,'kings-cross-src/web/src/data/kx-track.json'),'utf8'));
  const cameras = stationCameras(data);
  for(const key of ['south-front','front-oblique','shed-interior','platform-eye','concourse','western-range','roof-above','north-gable','great-northern-hotel','midland-grand-front','st-pancras-shed','gasworks-portals','top','side']) {
    assert.ok(cameras[key],key); const c=cameras[key]; assert.ok([...c.pos,...c.target].every(Number.isFinite)); assert.ok(Math.hypot(...c.pos.map((v,i)=>v-c.target[i]))>1); assert.ok(c.source.length>5);
  }
  assert.equal(cameras.top.grid,true); assert.equal(cameras.side.grid,true);
  assert.equal(AXES.length,9); assert.equal(cameras['platform-eye'].pos[1],2.5);
});

test('Western Range camera shows the whole west elevation from eye level, 62 m back on its mid-length', async () => {
  const data=JSON.parse(await readFile(path.join(root,'kings-cross-src/web/src/data/kx-track.json'),'utf8'));
  const s=shedLayout(data), camera=stationCameras(data)['western-range'];
  const local=worldToShed(s,[camera.pos[0],camera.pos[2]]), target=worldToShed(s,[camera.target[0],camera.target[2]]);
  const faceU=-WESTERN_RANGE.depth, middleV=(WESTERN_RANGE.v0+WESTERN_RANGE.v1)/2;
  assert.ok(Math.abs(local.u-(faceU-WESTERN_RANGE_STANDOFF))<1e-6,'the standpoint is 62 m west of the western face');
  assert.ok(Math.abs(local.v-middleV)<1e-6,'on the middle of the OSM-length range');
  assert.ok(Math.abs(target.u-(faceU-.1))<1e-6&&Math.abs(target.v-middleV)<1e-8,'aims square at the brick west face');
  assert.equal(camera.pos[1],1.6,'still eye level'); assert.equal(camera.fov,70);
  // What matters is what the lens sees: the face's four corners (both ends, ground and eave) are all inside the frame, and between them they
  // cross most of its width, so neither a close-up that crops the ends nor a distant speck can pass.
  const lens=lensFor(camera), eave=WESTERN_RANGE.storey*WESTERN_RANGE.storeys;
  const corner=(v,y)=>{const [x,z]=shedToWorld(s,faceU,v);return new THREE.Vector3(x,y,z).project(lens);};
  const corners=[[WESTERN_RANGE.v0,0],[WESTERN_RANGE.v0,eave],[WESTERN_RANGE.v1,0],[WESTERN_RANGE.v1,eave]].map(([v,y])=>corner(v,y));
  for(const p of corners) assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1,`a corner of the elevation is out of frame: ${p.x.toFixed(3)}, ${p.y.toFixed(3)}`);
  assert.ok(Math.abs(corners[0].x-corners[2].x)>1.7,`the elevation crosses ${(Math.abs(corners[0].x-corners[2].x)/2*100).toFixed(0)}% of the frame width`);
});

test('train closeups are three metres from the nose and coach side and include bogie gangway and 387', () => {
  const train = kind => ({kind,nose:[20,0,-10],h:0});
  const cameras = trainCameras(['lner9','lumo5','hull5','gn387x4'].map(train),{platforms:[]});
  assert.deepEqual(cameras['azuma-nose-3m'].pos,[20,1.7,-7]);
  assert.ok(Math.abs(cameras['coach-side-3m'].pos[0]-20-1.35-3)<1e-9);
  for (const name of ['gangway','bogie','great-northern-387','lumo','hull-trains']) assert.ok(cameras[name],name);
  assert.ok(!trainCameras([train('lner9')],{platforms:[]})['great-northern-387'],'missing 387 cannot be relabelled Azuma');
});

test('GC 180 and Thameslink 700 samples get nose three-quarter and whole-side views', () => {
  const train=kind=>({kind,nose:[20,0,-10],h:0});
  const cameras=trainCameras(['lner9','gc180x5','tl700x8'].map(train),{platforms:[]});
  for(const kind of ['gc180x5','tl700x8']) {
    const nose=cameras[`${kind}-nose-three-quarter`], side=cameras[`${kind}-whole-side`];
    assert.ok(nose,`${kind} nose view`); assert.ok(side,`${kind} whole-side view`);
    assert.equal(nose.pos[0]-20,3.5); assert.equal(nose.pos[2]+10,3);
    assert.equal(nose.detail,`sample ${kind}; nose three-quarter`);
    assert.equal(side.hideScenery,true); assert.equal(side.fov,7); assert.equal(side.near,100);
    assert.equal(side.detail,`sample ${kind}; full side; cutaway: shed and generic blocks hidden`);
    const distance=Math.hypot(side.pos[0]-side.target[0],side.pos[2]-side.target[2]);
    assert.equal(distance,Math.max(950,trainLayout(kind).length*6));
  }
  assert.equal(trainCameras([train('lner9')],{platforms:[]})['gc180x5-whole-side'],undefined);
  assert.equal(trainCameras([train('lner9')],{platforms:[]})['tl700x8-nose-three-quarter'],undefined);
});

test('signal state camera frames the OSM head face from nearby track level', () => {
  const camera=signalStateCamera([10,0,20],{facing:[0,1],travel:[0,-1],side:'left'});
  assert.deepEqual(camera.pos,[11.6,2.9,22.8]);
  assert.deepEqual(camera.target,[10,4.1,20.32]);
  assert.equal(camera.fov,30); assert.equal(camera.near,.1);
  const distance=Math.hypot(camera.pos[0]-camera.target[0],camera.pos[2]-camera.target[2]);
  assert.ok(distance>2.8&&distance<3.1,'camera is about three metres from the signal face');
  assert.ok(camera.pos[1]<3.95&&camera.target[1]>3.95,'camera is below the lamp and tilts slightly upward');
});

test('signal detail board visibility restores its prior inline style', () => {
  const values=new Map([['visibility',{value:'visible',priority:'important'}]]);
  const board={style:{
    getPropertyValue:key=>values.get(key)?.value??'',
    getPropertyPriority:key=>values.get(key)?.priority??'',
    setProperty:(key,value,priority='')=>values.set(key,{value,priority}),
    removeProperty:key=>values.delete(key),
  }};
  const prior=setSignalDetailBoardVisibility(board,true);
  assert.deepEqual(values.get('visibility'),{value:'hidden',priority:''});
  setSignalDetailBoardVisibility(board,false,prior);
  assert.deepEqual(values.get('visibility'),{value:'visible',priority:'important'});
  const noInlineStyle={style:board.style};
  values.delete('visibility');
  const emptyPrior=setSignalDetailBoardVisibility(noInlineStyle,true);
  setSignalDetailBoardVisibility(noInlineStyle,false,emptyPrior);
  assert.equal(values.has('visibility'),false);
});

test('every named station and sample train camera clears the rendered city building roofs', async () => {
  const data = JSON.parse(await readFile(path.join(root,'kings-cross-src/web/src/data/kx-track.json'),'utf8'));
  const city = JSON.parse(await readFile(path.join(root,'kings-cross-src/web/src/data/kx-city.json'),'utf8'));
  assert.ok(city.extract && city.roads.length, 'check against the current city extract');
  const s=shedLayout(data), stops=shedBufferStops(data,s).sort((a,b)=>worldToShed(s,[a.x,a.z]).u-worldToShed(s,[b.x,b.z]).u);
  const trains=[['lner9',1],['lner5',3],['hull5',5],['lumo5',7],['gn387x4',3],['gc180x5',3],['tl700x8',3]].map(([kind,i])=>{
    const pose=standingTrainPose(s,stops[i],1.5); return {kind,nose:[pose.nose[0],0,pose.nose[1]],h:s.heading};
  });
  const cameras={...stationCameras(data),...trainCameras(trains,data)}, buildings=cityBuildings(data);
  assert.deepEqual(cameraBuildingCollisions(cameras,buildings),[]);
  // Pin the requested clear positions; check the old footprints at street height too.
  const at=(u,v,y)=>{const [x,z]=shedToWorld(s,u,v);return [x,y,z];};
  assert.deepEqual(cameras['south-front'].pos,at(s.width/2,-70,26));
  assert.deepEqual(cameras['western-range'].pos,at(-WESTERN_RANGE.depth-WESTERN_RANGE_STANDOFF,(WESTERN_RANGE.v0+WESTERN_RANGE.v1)/2,1.6));
  for (const [name,pos,id] of [['south-front',at(s.width/2,-125,2),137827419],['western-range',at(-65,185,12),1018561795]]) {
    assert.ok(cameraBuildingCollisions({[name]:{...cameras[name],pos}},buildings).some(c=>c.buildingId===id),name);
  }
});

test('a camera moved inside a footprint is rejected below the fitted roof and allowed above it', () => {
  const building=planBuilding({id:42,kind:'office',height:20,pts:[[0,0],[10,0],[10,10],[0,10]]});
  assert.deepEqual(cameraBuildingCollisions({street:{pos:[-1,2,5]},above:{pos:[5,21,5]}},[building]),[]);
  const hit=cameraBuildingCollisions({moved:{pos:[5,2,5]}},[building]);
  assert.equal(hit.length,1); assert.equal(hit[0].camera,'moved'); assert.equal(hit[0].buildingId,42);
  assert.ok(Math.abs(hit[0].roofY-19.35)<1e-9);
});

test('shots and scenery visibility wait for the lazy city and still support bare and older pages', async () => {
  let arrive;
  const shed={visible:true}, kx={parts:{shed,buildings:null},cityLoaded:new Promise(resolve=>{arrive=resolve;})};
  // Exercise the same serialized function as CDP, with no hidden Node closures.
  let shot=false;
  const preparing=runInNewContext(`(${prepareEvidenceScene.toString()})(kx,true)`,{kx}).then(()=>{shot=true;});
  await Promise.resolve(); assert.equal(shot,false); assert.equal(shed.visible,true);
  kx.parts.buildings={visible:true}; arrive(); await preparing;
  assert.equal(shot,true); assert.equal(shed.visible,false); assert.equal(kx.parts.buildings.visible,false);
  await prepareEvidenceScene(kx,false); assert.equal(kx.parts.buildings.visible,true);
  await prepareEvidenceScene({parts:{shed}},true);
  await prepareEvidenceScene({cityLoaded:Promise.resolve(),parts:{}},undefined,true);
  await assert.rejects(prepareEvidenceScene({cityLoaded:Promise.resolve(),parts:{}},false),/without the city/);
});

test('signal state targets exclude inferred and synthetic heads and require proof for unknown', () => {
  for(const state of ['danger','proceed','unknown']) {
    const rows=[{id:-1,inferred:true,state},{id:-2,inferred:false,state},{id:8,inferred:true,state},{id:9,inferred:false,state}];
    assert.equal(signalStateTarget(rows,state,new Set([9])),rows[3]);
  }
  assert.equal(signalStateTarget([{id:9,inferred:false,state:'unknown'}],'unknown'),null);
  assert.equal(signalStateTarget([{id:9,inferred:false,state:'proceed'}],'danger'),null);
});

test('state search starts at the requested time and finds other decoded heads farther into the replay', async () => {
  const real=(id,state)=>({id,state,inferred:false});
  const frames=[
    {timeMs:900,signals:[real(11,'proceed')]},
    {timeMs:1000,signals:[{id:-1,state:'danger',inferred:true},real(12,'unknown')]},
    {timeMs:1100,signals:[real(11,'danger'),real(12,'proceed')]},
    {timeMs:1200,signals:[real(11,'unknown')]},
  ];
  let cursor=0; const shots=[];
  const result=await searchSignalStates({sample:async()=>frames[cursor++],capture:async(s,state)=>{shots.push([s.id,state]);return true;},
    startMs:1000,endMs:2000,timeoutMs:1000,wait:async()=>{},now:()=>0});
  assert.deepEqual(shots,[[11,'danger'],[12,'proceed'],[11,'unknown']]);
  assert.deepEqual(result.missing,[]); assert.equal(result.scannedUntilMs,1200);
});

test('missing replay states return explicit gaps at the window end or recording end without timing out', async () => {
  for(const ended of [false,true]) {
    let timeMs=1000, calls=0;
    const result=await searchSignalStates({sample:async()=>({timeMs,ended,signals:[{id:-1,inferred:true,state:'danger'}]}),
      capture:async()=>{calls++;return true;},startMs:1000,endMs:1200,timeoutMs:1000,now:()=>0,wait:async()=>{timeMs+=100;}});
    assert.deepEqual(result.missing,['danger','proceed','unknown']); assert.equal(calls,0);
    assert.equal(result.reason,ended?'recording ended':'window ended');
  }
});

test('a stale aspect capture is retried and a stalled replay returns a bounded gap', async () => {
  let clock=0,attempts=0;
  const result=await searchSignalStates({sample:async()=>({timeMs:1000,signals:[{id:11,inferred:false,state:'danger'}]}),
    capture:async()=>++attempts>1,startMs:1000,endMs:2000,timeoutMs:20,now:()=>clock,wait:async()=>{clock+=10;}});
  assert.equal(attempts,2); assert.deepEqual(result.captures.map(c=>c.state),['danger']);
  assert.deepEqual(result.missing,['proceed','unknown']); assert.match(result.reason,/capture budget/);
  assert.equal(clock,20);
});

test('signal windows use the recording date London time in winter and summer', () => {
  assert.deepEqual(signalReplayWindow('2026-11-07','16:23:55'),{startMs:Date.parse('2026-11-07T16:23:55Z'),endMs:Date.parse('2026-11-07T16:33:55Z')});
  assert.equal(signalReplayWindow('2026-07-07','16:23:55').startMs,Date.parse('2026-07-07T15:23:55Z'));
});

function fakeChrome() { const child = new EventEmitter(); child.stdio=[null,null,null,new PassThrough(),new PassThrough()]; return child; }
test('CDP handles fragmented pipe messages and rejects all promises when Chrome exits', async () => {
  const child=fakeChrome(), events=[], cdp=cdpPipe(child,e=>events.push(e));
  const first=cdp.send('Browser.getVersion');
  child.stdio[4].write('{"id":1,"res'); child.stdio[4].write('ult":{"product":"synthetic"}}\0{"method":"Page.loadEventFired"}\0');
  assert.deepEqual(await first,{product:'synthetic'}); assert.equal(events[0].method,'Page.loadEventFired');
  const pending=cdp.send('Runtime.evaluate'); const rejected=assert.rejects(pending,/Chrome exited/); child.emit('exit',1); await rejected;
  await assert.rejects(cdp.send('Browser.getVersion'),/Chrome exited/);
});

test('CDP commands and child checks are bounded and child input is closed', async () => {
  const child=fakeChrome(), cdp=cdpPipe(child);
  await assert.rejects(cdp.send('No.reply',{},undefined,20),/timed out/); cdp.close();
  const log=path.join(scratch,'bounded.log');
  const result=await commandResult(process.execPath,['-e','setInterval(()=>{},1000)'],root,log,80);
  assert.equal(result.timedOut,true); assert.notEqual(result.code,0);
  const eof=await commandResult(process.execPath,['-e',"process.stdin.resume();process.stdin.on('end',()=>console.log('EOF'));"],root,log,2000);
  assert.equal(eof.code,0); assert.equal((await readFile(log,'utf8')).trim(),'EOF');
});


test('proxy faults cut SSE and recover without stopping the upstream relay', async () => {
  const hosts = [], requests = [];
  const upstream = createServer((req, res) => {
    hosts.push(req.headers.host); requests.push(req.url);
    if(req.url === '/events') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: snapshot\ndata: {"synthetic":true}\n\n'); }
    else { res.writeHead(200, { 'content-type': 'application/json' }).end('{"synthetic":true}'); }
  });
  let proxy, reader;
  try {
    await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(0,'127.0.0.1',resolve);});
    const relay=relayUrl(`http://127.0.0.1:${upstream.address().port}`);
    proxy=createEvidenceServer({ dist:scratch, relay });
    await new Promise((resolve,reject)=>{proxy.server.once('error',reject);proxy.server.listen(0,'127.0.0.1',resolve);});
    const base=`http://127.0.0.1:${proxy.server.address().port}`;
    assert.equal((await fetch(`${base}/relay/health`)).status,200);
    assert.equal(hosts[0],relay.host);
    const events=await fetch(`${base}/relay/events`); reader=events.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value),/snapshot/);
    proxy.setProxy(false);
    const ended=await reader.read().then(v=>v.done,()=>true);
    assert.equal(ended,true);
    assert.equal((await fetch(`${base}/relay/health`)).status,503);
    proxy.setProxy(true);
    const count=requests.length;
    assert.equal((await fetch(`${base}/relay/health`,{method:'POST'})).status,405);
    assert.equal(requests.length,count);
    assert.equal((await fetch(`${base}/relay/health`)).status,200);
    assert.equal(upstream.listening,true);
  } finally {
    await reader?.cancel().catch(()=>{}); await proxy?.close(); upstream.closeAllConnections();
    if(upstream.listening) await new Promise(resolve=>upstream.close(resolve));
  }
});


test('private output refuses symlinked directories and report files before writing', async () => {
  const dir=await mkdtemp(path.join(scratch,'output-'));
  try {
    const work=path.join(dir,'work'), outside=path.join(dir,'outside');
    await mkdir(work); await mkdir(outside);
    await symlink(outside,path.join(work,'.scratch'));
    await assert.rejects(safeOutputDirectory(work,path.join(work,'.scratch','pack')),/symlink/);
    const output=path.join(work,'safe'); await safeOutputDirectory(work,output);
    const protectedFile=path.join(outside,'protected.json'); await writeFile(protectedFile,'synthetic untouched');
    await symlink(protectedFile,path.join(output,'manifest.json'));
    await assert.rejects(writePrivateFile(path.join(output,'manifest.json'),'private synthetic data'));
    assert.equal(await readFile(protectedFile,'utf8'),'synthetic untouched');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

// ---- wave 0 of the graphical-fidelity programme: element views, the scene pin, the flicker check, the lighting fingerprint ----
const trackData = JSON.parse(await readFile(path.join(root, 'kings-cross-src/web/src/data/kx-track.json'), 'utf8'));
/** The cameras the six element rubrics add (gfx-rubrics/rubric-<element>.md, "Fixed views"), by element. */
const NEW_CAMERAS = {
  'lighting-materials': ['facade-brick-close'],
  'kx-front': ['tower-close', 'front-southwest-pedestrian', 'shed-east-flank'],
  'shed-interior': ['platform-eye-p1-north', 'platform-eye-p8-south', 'roof-underside', 'furniture-close', 'suburban-p9'],
  'western-concourse': ['concourse-funnel-up', 'concourse-exterior-square', 'western-range-full'],
  'historic-neighbours': ['gnh-from-square', 'midland-euston-road', 'midland-clock-tower', 'barlow-interior'],
  'city-surroundings': ['granary-square', 'gasholders', 'canal-lock', 'kings-boulevard', 'euston-road-east'],
};
/** Cameras added beside the rubrics' own, on the lead's request (the square's south-west is behind the hotel; see tests/camera-faults.test.mjs). */
const EXTRA_CAMERAS = ['concourse-exterior-west'];
/** The twenty cameras that existed before wave 0, as that commit placed them: the new views must not move them. */
const OLD_CAMERAS = {"overview":{"pos":[260,220,90],"target":[46.3756,5,-131.6293]},"top":{"pos":[46.3756,3000,-131.6293],"target":[46.3784,0,-131.7293],"fov":12,"near":100,"grid":true},"side":{"pos":[1531.8966,65,-89.9688],"target":[46.3756,65,-131.6293],"fov":7,"near":100,"grid":true},"south-front":{"pos":[41.0493,26,58.296],"target":[43.0116,12,-11.6765]},"front-oblique":{"pos":[146.6921,32,76.2646],"target":[43.5723,12,-31.6686]},"shed-interior":{"pos":[44.15,3.2,-328.45],"target":[45.8149,8,-111.6372]},"platform-eye":{"pos":[43.5429,2.5,-210.0929],"target":[44.6642,2.5,-250.0771]},"concourse":{"pos":[-58.1982,2.5,-90.5031],"target":[-21.2568,12,-90.5031]},"western-range":{"pos":[-8.9753,1.6,-87.9638],"target":[-3.0776,3.5,-87.7984],"fov":35,"near":0.1},"western-range-gateline":{"pos":[-46.9924,3,-52.2155],"target":[-4.0193,5.5,-51.0104],"fov":60,"near":0.1},"roof-above":{"pos":[91.0776,131.6408,-120.3717],"target":[46.0953,18.6408,-121.6332]},"north-gable":{"pos":[52.0899,18,-335.3892],"target":[49.8473,12,-255.4206]},"concourse-roof-detail":{"pos":[-27.5055,13.0377,-86.6033],"target":[-26.0055,19.0377,-87.6033],"fov":50,"near":0.1},"platform-eye-south":{"pos":[43.5429,2.5,-210.0929],"target":[42.4215,2.5,-170.1086]},"great-northern-hotel":{"pos":[-76.8251,10,-5.3446],"target":[-61.25,9.65,-24.9],"fov":75,"near":0.1},"concourse-hotel-junction":{"pos":[-22.8431,14,-71.9845],"target":[-53.4,9.65,-38.95]},"midland-grand-front":{"pos":[-22.982,28,232.1209],"target":[-89.85,11,97.85]},"st-pancras-shed":{"pos":[-51.6307,46,147.2178],"target":[-132.3879,15.24,-13.6494]},"st-pancras-shed-oblique":{"pos":[180.6156,182.88,-30.9907],"target":[-134.9916,14.6304,-18.836],"fov":55,"near":0.1},"gasworks-portals":{"pos":[40.1745,12,-393.4972],"target":[42.2617,4,-458.4637]}};

test('--views, --time, --weather and --sky are validated before any browser starts', () => {
  assert.equal(optionsFrom([]).views, 'all');
  assert.deepEqual(optionsFrom([]).pin, { mode: 'pinned', time: '2026-06-21T12:00:00+01:00', weather: 'clear' });
  assert.equal(optionsFrom(['--views', 'kx-front']).views, 'kx-front');
  assert.equal(optionsFrom(['--views', 'kx-front,tower-close,station']).views, 'kx-front,tower-close,station');
  assert.equal(optionsFrom(['--views', 'all', '--date', '20261109']).date, '20261109', 'all is the whole pack, which takes the replay options');
  for (const value of ['KX-front', 'kx front', 'kx-front,', ',kx-front', 'kx_front', '-front', 'a--b', 'a,,b']) assert.throws(() => optionsFrom(['--views', value]), /--views must be all, or element and view names separated by commas/, value);
  assert.throws(() => optionsFrom(['--views']), /missing value for --views/);
  assert.throws(() => optionsFrom(['--views', 'kx-front', '--views', 'shed-interior']), /unknown or repeated option: --views/);
  for (const [flag, value] of [['--relay', 'http://127.0.0.1:8787'], ['--live-report', 'capture.json'], ['--raw-osm', 'osm.json'], ['--date', '20261109'], ['--speed', '4'], ['--signal-at', '12:00:00']]) {
    assert.throws(() => optionsFrom(['--views', 'kx-front', flag, value]), new RegExp(`--views captures fixed station views only; remove .*${flag}`), flag);
  }
  assert.deepEqual(optionsFrom(['--time', '2026-11-09T16:25:00Z', '--weather', 'rain']).pin, { mode: 'pinned', time: '2026-11-09T16:25:00Z', weather: 'rain' });
  assert.equal(optionsFrom(['--views', 'kx-front', '--weather', 'fog']).pin.weather, 'fog', 'a views run takes a pin');
  assert.deepEqual(optionsFrom(['--sky', 'ref']).pin, { mode: 'ref' });
  assert.throws(() => optionsFrom(['--time', 'noon']), /--time must be an ISO 8601 instant/);
  assert.throws(() => optionsFrom(['--weather', 'hail']), /--weather must be one of/);
  assert.throws(() => optionsFrom(['--sky', 'day']), /--sky must be ref/);
  assert.throws(() => optionsFrom(['--sky', 'ref', '--weather', 'clear']), /cannot be combined/);
  assert.throws(() => optionsFrom(['--time']), /missing value for --time/);
});

test('every element names only fixed views that exist, and holds the cameras its rubric adds', () => {
  const cameras = stationCameras(trackData), views = new Set(stationViewNames(cameras));
  assert.deepEqual(Object.keys(ELEMENT_VIEWS).sort(), Object.keys(NEW_CAMERAS).sort(), 'the six elements');
  for (const [element, names] of Object.entries(ELEMENT_VIEWS)) {
    assert.equal(new Set(names).size, names.length, `${element} lists a view twice`);
    for (const name of names) assert.ok(views.has(name), `${element}: ${name} is not a station view`);
    for (const name of NEW_CAMERAS[element]) assert.ok(names.includes(name), `${element} does not list its new view ${name}`);
    assert.ok(!names.some(name => cameras[name]?.grid), `${element} lists a grid camera`);
  }
  assert.deepEqual(stationViewNames(cameras).filter(name => name.endsWith('-solid-slate')).sort(), ['front-oblique-solid-slate', 'roof-above-solid-slate']);
});

test('resolveViews turns elements, view names and station into the set of views to shoot', () => {
  const cameras = stationCameras(trackData);
  assert.equal(resolveViews(undefined, cameras), null);
  assert.equal(resolveViews('all', cameras), null);
  for (const element of Object.keys(ELEMENT_VIEWS)) assert.deepEqual([...resolveViews(element, cameras)], ELEMENT_VIEWS[element], element);
  assert.deepEqual([...resolveViews('tower-close', cameras)], ['tower-close']);
  assert.deepEqual([...resolveViews('tower-close, kx-front', cameras)], ['tower-close', ...ELEMENT_VIEWS['kx-front'].filter(name => name !== 'tower-close')], 'a view named twice is shot once, and spaces after a comma are fine');
  assert.deepEqual([...resolveViews('front-oblique-solid-slate', cameras)], ['front-oblique-solid-slate']);
  const everything = resolveViews('station', cameras);
  assert.deepEqual([...everything].sort(), stationViewNames(cameras).sort());
  for (const name of ['top', 'side', 'roof-above-solid-slate', 'canal-lock', 'overview']) assert.ok(everything.has(name), name);
  for (const bad of ['', 'kx-fron', 'KX-front', 'tower-close,nonsense', 'kx-front,']) assert.throws(() => resolveViews(bad, cameras), /unknown view or element: /, JSON.stringify(bad));
  assert.throws(() => resolveViews('nonsense', cameras), /Elements: lighting-materials, kx-front, .* Views: overview, /s, 'the message teaches the valid names');
  const withoutTower = Object.fromEntries(Object.entries(cameras).filter(([name]) => name !== 'tower-close'));
  assert.throws(() => resolveViews('kx-front', withoutTower), /element kx-front lists tower-close, which is not a station camera/);
  assert.throws(() => resolveViews('constructor', cameras), /unknown view or element: constructor/, 'a name inherited from Object is not an element');
});

test('runStationEvidenceShots shoots every fixed view twice for flicker, or only the selected ones', async () => {
  const cameras = stationCameras(trackData);
  const run = async select => {
    const shots = [];
    await runStationEvidenceShots(cameras, async (axis, name, camera, extra) => { shots.push({ axis, name, camera, extra }); }, async (_axis, _name, capture) => capture(), select);
    return shots;
  };
  const all = await run(null);
  assert.ok(all.every(shot => shot.axis === '02' && shot.extra.twoFrame === true), 'every fixed view takes the two-frame flicker check');
  assert.deepEqual(all.map(shot => shot.name).sort(), stationViewNames(cameras).filter(name => !cameras[name]?.grid).sort(), 'the grid cameras are axis 01, shot elsewhere');
  const some = await run(resolveViews('tower-close,front-oblique-solid-slate', cameras));
  assert.deepEqual(some.map(shot => shot.name), ['tower-close', 'front-oblique-solid-slate']);
  assert.equal(some[0].camera, cameras['tower-close']);
  assert.equal(some[1].camera, cameras['front-oblique']);
  assert.equal(some[1].extra.roofMaterialEvidence, 'solid slate (evidence override)');
  assert.deepEqual(await run(new Set()), [], 'an empty selection shoots nothing');
  for (const element of Object.keys(ELEMENT_VIEWS)) assert.deepEqual((await run(resolveViews(element, cameras))).map(shot => shot.name).sort(), [...ELEMENT_VIEWS[element]].sort(), element);
});

// The round-4 scorer found `western-range` (a 1.6 m stand 6 m off the face, about three bays in frame) useless; the lead asked for it to be
// moved back to show the whole west elevation. It keeps its name and is the one pre-wave-0 camera allowed to move (see its own test).
const REFRAMED = ['western-range'];
test('the twenty cameras that were there before wave 0 are all still there, and only western-range, re-framed on request, has moved', () => {
  const cameras = stationCameras(trackData);
  assert.deepEqual(Object.keys(OLD_CAMERAS).filter(name => !cameras[name]), [], 'none was removed or renamed');
  for (const [name, was] of Object.entries(OLD_CAMERAS)) {
    const now = cameras[name];
    if (REFRAMED.includes(name)) { assert.ok(Math.hypot(...now.pos.map((v, i) => v - was.pos[i])) > 30, `${name} was moved back from its close-up`); continue; }
    for (const key of ['pos', 'target']) was[key].forEach((value, i) => assert.ok(Math.abs(now[key][i] - value) < 1e-3, `${name}.${key}[${i}]: ${now[key][i]} against ${value}`));
    assert.equal(now.fov, was.fov, `${name}.fov`);
    assert.equal(now.near, was.near, `${name}.near`);
    assert.equal(now.grid, was.grid, `${name}.grid`);
  }
});

test('every camera the six rubrics add exists, looks somewhere, and names the photograph it was framed from', () => {
  const cameras = stationCameras(trackData), added = Object.values(NEW_CAMERAS).flat();
  assert.equal(added.length, 21);
  assert.equal(new Set(added).size, 21, 'no view is added twice');
  assert.equal(Object.keys(cameras).length, Object.keys(OLD_CAMERAS).length + added.length + EXTRA_CAMERAS.length, 'nothing else was added');
  assert.deepEqual(EXTRA_CAMERAS.filter(name => added.includes(name)), [], 'an extra camera is not one a rubric names');
  for (const name of EXTRA_CAMERAS) { assert.ok(cameras[name], name); assert.match(cameras[name].source, /\([a-z0-9-]+\.jpg/, `${name} names its reference photograph`); assert.ok(Object.values(ELEMENT_VIEWS).some(names => names.includes(name)), `${name} is scored with an element`); }
  for (const [element, names] of Object.entries(NEW_CAMERAS)) for (const name of names) {
    const camera = cameras[name];
    assert.ok(camera, `${element}: ${name}`);
    assert.ok([...camera.pos, ...camera.target].every(Number.isFinite), `${name} finite`);
    assert.ok(Math.hypot(...camera.pos.map((v, i) => v - camera.target[i])) > 4, `${name} looks at something away from its eye`);
    assert.match(camera.source, /\([a-z0-9-]+\.jpg\)/, `${name}: the source names its reference photograph`);
    assert.ok(camera.fov === undefined || camera.fov >= 20 && camera.fov <= 90, `${name} fov`);
    assert.ok(!camera.grid && !camera.hideScenery, `${name} is a plain fixed view`);
  }
});

test('the new cameras stand where their sources say: the platform eyes on the platform, the street cameras on the ground', () => {
  const cameras = stationCameras(trackData), { terrain } = stationWorld(), platformEye = cameras['platform-eye'].pos[1];
  for (const name of ['platform-eye-p1-north', 'platform-eye-p8-south', 'roof-underside', 'furniture-close', 'suburban-p9']) assert.equal(cameras[name].pos[1], platformEye, `${name} is 1.6 m above its platform`);
  for (const name of ['facade-brick-close', 'front-southwest-pedestrian', 'concourse-exterior-square', 'concourse-exterior-west', 'gnh-from-square', 'midland-euston-road', 'granary-square', 'gasholders', 'canal-lock', 'kings-boulevard', 'euston-road-east']) {
    const [x, y, z] = cameras[name].pos;
    assert.ok(Math.abs(y - terrain.heightAt(x, z) - 1.7) < 1e-9, `${name}: the eye is 1.7 m above the terrain under it (${y} over ${terrain.heightAt(x, z)})`);
  }
  assert.equal(cameras['tower-close'].pos[1], 28);
  assert.equal(cameras['tower-close'].fov, 35);
  assert.equal(cameras['western-range-full'].pos[1], 8);
  assert.ok(cameras['roof-underside'].target[1] > cameras['roof-underside'].pos[1] + 15, 'the roof underside view is pitched well up');
});

// A fake page `kx` carrying only what the lighting probe reads: a light rig, a vertex-coloured sky dome, fog and the renderer settings.
function lightingKx({ atmosphere, fog = null, lights } = {}) {
  const colour = hex => ({ getHexString: () => hex });
  const light = (type, hex, intensity, position, extra = {}) => ({ isLight: true, type, name: '', color: colour(hex), intensity, position: { toArray: () => position }, visible: true, ...extra });
  const rig = lights ?? [light('HemisphereLight', 'aabbcc', .6, [0, 1, 0], { groundColor: colour('443322') }), light('DirectionalLight', 'ffeecc', 1.2, [100, 200, 50])];
  const position = { count: 3, getY: i => [-1, 0, 1][i] };
  const colours = { getX: i => [.9, .5, .1][i], getY: i => [.8, .5, .2][i], getZ: i => [.7, .5, .3][i] };
  const dome = { isMesh: true, geometry: { type: 'SphereGeometry', parameters: { radius: 4000 }, getAttribute: name => name === 'position' ? position : colours } };
  const small = { isMesh: true, geometry: { type: 'SphereGeometry', parameters: { radius: 2 }, getAttribute: () => { throw new Error('not the sky'); } } };
  const kx = { scene: { background: colour('112233'), fog: fog && { ...fog, color: colour(fog.colour) }, children: [small, dome], traverse(visit) { rig.forEach(visit); } },
    renderer: { toneMapping: 4, toneMappingExposure: 0.85, outputColorSpace: 'srgb' } };
  if (atmosphere !== undefined) kx.atmosphere = atmosphere;
  return kx;
}

test('the lighting probe reads the rig, the sky dome, the fog and what the page says about its atmosphere', () => {
  const probe = lightingProbe(lightingKx());
  assert.deepEqual(probe.lights[0], { type: 'HemisphereLight', name: null, colour: 'aabbcc', groundColour: '443322', intensity: .6, position: [0, 1, 0], visible: true });
  assert.equal(probe.lights[1].type, 'DirectionalLight');
  assert.deepEqual(probe.horizon, [.9, .8, .7], 'the lowest dome vertex is the horizon');
  assert.deepEqual(probe.zenith, [.1, .2, .3], 'the highest is the zenith');
  assert.equal(probe.background, '112233');
  assert.deepEqual([probe.toneMapping, probe.exposure, probe.outputColorSpace], [4, .85, 'srgb']);
  assert.equal(probe.fog, null);
  assert.equal(probe.atmosphere, 'absent', 'a page with no atmosphere hook predates the sky and weather work');
  assert.equal(lightingProbe(lightingKx({ atmosphere: null })).atmosphere, 'fixed', 'a hook that is null is the old fixed look');
  assert.deepEqual(lightingProbe(lightingKx({ atmosphere: { state: () => ({ sun: { elevationDeg: 61.23456 } }) } })).atmosphere, { sunElevationDeg: 61.2346 });
  assert.deepEqual(lightingProbe(lightingKx({ atmosphere: { state: () => ({}) } })).atmosphere, { sunElevationDeg: null });
  assert.deepEqual(lightingProbe(lightingKx({ atmosphere: { state() { throw new Error('mid-update'); } } })).atmosphere, { sunElevationDeg: null }, 'a hook that throws does not stop the shot');
  assert.deepEqual(lightingProbe(lightingKx({ fog: { colour: '99aabb', near: 10, far: 900 } })).fog, { colour: '99aabb', near: 10, far: 900, density: null });
  assert.deepEqual(lightingProbe(lightingKx({ fog: { colour: '99aabb', density: .002 } })).fog, { colour: '99aabb', near: null, far: null, density: .002 });
  const noDome = lightingKx(); noDome.scene.children.pop();
  assert.deepEqual([lightingProbe(noDome).horizon, lightingProbe(noDome).zenith], [null, null], 'no sky dome, no sky colours');
});

test('the probe runs inside the page: it needs nothing from this module', () => {
  const kx = lightingKx({ atmosphere: { state: () => ({ sun: { elevationDeg: 12.5 } }) }, fog: { colour: '99aabb', near: 10, far: 900 } });
  const inPage = JSON.parse(JSON.stringify(runInNewContext(`(${lightingProbe.toString()})(kx)`, { kx })));
  assert.deepEqual(inPage, JSON.parse(JSON.stringify(lightingProbe(kx))));
});

test('equal lighting fingerprints mean equal lighting, whatever the order of the lights or the keys', () => {
  const base = lightingProbe(lightingKx()), print = lightingFingerprint(base);
  assert.match(print, /^[0-9a-f]{16}$/);
  assert.equal(lightingFingerprint(lightingProbe(lightingKx())), print, 'the same rig reads the same');
  assert.equal(lightingFingerprint({ ...base, lights: [...base.lights].reverse() }), print, 'the order of the lights does not matter');
  assert.equal(lightingFingerprint(Object.fromEntries(Object.entries(base).reverse())), print, 'nor does the order of the keys');
  const variants = {
    intensity: { ...base, lights: [{ ...base.lights[0], intensity: .61 }, base.lights[1]] },
    colour: { ...base, lights: [base.lights[0], { ...base.lights[1], colour: 'ffeecd' }] },
    position: { ...base, lights: [base.lights[0], { ...base.lights[1], position: [100, 200, 51] }] },
    extraLight: { ...base, lights: [...base.lights, { ...base.lights[1], name: 'fill' }] },
    background: { ...base, background: '112234' },
    horizon: { ...base, horizon: [.9, .8, .71] },
    fog: lightingProbe(lightingKx({ fog: { colour: '99aabb', near: 10, far: 900 } })),
    exposure: { ...base, exposure: .86 },
    toneMapping: { ...base, toneMapping: 5 },
    atmosphere: { ...base, atmosphere: { sunElevationDeg: 12 } },
    sun: { ...base, atmosphere: { sunElevationDeg: 13 } },
  };
  const prints = Object.values(variants).map(lightingFingerprint);
  assert.equal(new Set([print, ...prints]).size, prints.length + 1, 'every change to the lighting changes the fingerprint');
  assert.match(LIGHTING_NOTE, /lighting\.pinHonoured/);
});

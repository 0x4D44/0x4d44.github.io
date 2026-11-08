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
import { planBuilding } from '../../core/city.ts';
import { shedBufferStops, shedLayout, shedToWorld, standingTrainPose, worldToShed } from '../../core/station.ts';
import { trainLayout } from '../../core/train.ts';
import { WESTERN_RANGE } from '../../web/src/shed.ts';
import { AXES, cameraBuildingCollisions, cityBuildings, cdpPipe, createEvidenceServer, commandResult, optionsFrom, prepareEvidenceScene, proxyTarget, realMetal, relayUrl, safeFile, safeOutputDirectory, searchSignalStates, signalReplayWindow, signalStateTarget, signalStateCamera, setSignalDetailBoardVisibility, writePrivateFile, runAxis04Reports, stationCameras, trainCameras, within } from '../evidence.mjs';

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

test('Western Range camera frames the actual west brick facade at eye level', async () => {
  const data=JSON.parse(await readFile(path.join(root,'kings-cross-src/web/src/data/kx-track.json'),'utf8'));
  const s=shedLayout(data), camera=stationCameras(data)['western-range'];
  const local=worldToShed(s,[camera.pos[0],camera.pos[2]]), target=worldToShed(s,[camera.target[0],camera.target[2]]);
  const facadeU=-WESTERN_RANGE.depth-.01, middleV=(WESTERN_RANGE.v0+WESTERN_RANGE.v1)/2;
  assert.ok(local.u<facadeU && local.u-facadeU>-7,'camera sits within seven metres outside the western face');
  assert.ok(local.v>=WESTERN_RANGE.v0&&local.v<=WESTERN_RANGE.v1,'camera stays alongside the OSM-length range');
  assert.ok(Math.abs(local.v-middleV)<1e-8);
  assert.ok(Math.abs(target.u-facadeU)<.2&&Math.abs(target.v-middleV)<1e-8,'aims at the brick west face');
  assert.equal(camera.pos[1],1.6); assert.equal(camera.fov,35);
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
  assert.deepEqual(cameras['western-range'].pos,at(-WESTERN_RANGE.depth-6,(WESTERN_RANGE.v0+WESTERN_RANGE.v1)/2,1.6));
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

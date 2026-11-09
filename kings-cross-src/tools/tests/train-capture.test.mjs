import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,symlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {EventEmitter} from 'node:events';
import * as T from 'three';
import {ALL_KINDS,trainLayout} from '../../core/train.ts';
import {buildTrain} from '../../web/src/train.ts';
import {selectPortalFrames,verifyPortalSequence,capturePortalFrames,capturePlans,captureSequences,verifyReplayFrame,frozenTrainEndpoint,frozenBytes,frozenSchedulePolicy,portalCapturePlan,catalogueTracks,corridorPoints,replaySession,replayUrl,measuredPhase,describeCaptureFrames,chromeArgs} from '../train-capture.mjs';
import {detailCamera,inspectTrainFrame,sequenceCamera,setCaptureView,trainBounds,followTrainCamera,portalTrainCamera,intersectCaptureRay} from '../train-framing.mjs';
import {createCaptureLifetime,cleanupCaptureBrowser} from '../capture-runtime.mjs';
const frame=(timeMs,speedMps=0)=>({timeMs,point:[0,10],speedMps,state:speedMps?'moving':'held',lengthM:26,reversals:0,occupied:[{a:1,b:2,fromT:0,toT:1,edgeLengthM:40}]});
const plan=(direction='arrival',trainId=1)=>({recordingIndex:0,trainId,description:'SYN',kind:'synthetic',platform:'2',direction,movedM:2,startMs:1,frames:[frame(1,1),frame(2,0),frame(3,0)]});
const pack=()=>({recordings:[{index:0}],reproducibility:{inputHashes:{}},captureCandidates:[plan(),plan('departure')]});
test('train capture requires measured movement and a platform hold in each recording and direction',()=>{
 assert.equal(capturePlans(pack()).plans.length,2);
 for(const change of [p=>p.captureCandidates.pop(),p=>p.captureCandidates[0].frames=[],p=>p.captureCandidates[0].kind=null,
  p=>p.captureCandidates[0].frames[0].occupied=[],p=>p.captureCandidates[0].frames[1].timeMs=1,p=>p.captureCandidates[0].frames.forEach(f=>f.speedMps=0),
  p=>p.captureCandidates[0].frames.forEach(f=>f.state='moving'),p=>p.captureCandidates[0].movedM=0,p=>p.recordings.push({index:1})]){
  const p=pack();change(p);assert.throws(()=>capturePlans(p));
 }
});
test('train capture keeps failed provenance tries another real train and fails missing sequences',async()=>{
 const p=pack();p.captureCandidates.splice(1,0,plan('arrival',2));
 let result;await assert.doesNotReject(async()=>{result=await captureSequences(p,async a=>{if(a.trainId===1&&a.direction==='arrival')throw Object.assign(new Error('wall'),{details:{blocker:'synthetic'}});return a;});});
 assert.equal(result.exitCode,0);assert.equal(result.shots.length,2);assert.equal(result.shots[0].trainId,2);assert.equal(result.failed.length,1);assert.equal(result.failed[0].details.blocker,'synthetic');
 const missing=await captureSequences(p,async a=>{if(a.direction==='arrival')throw new Error('blocked');return a;});
 assert.equal(missing.exitCode,1);assert.deepEqual(missing.missing,['0-arrival']);assert.equal(missing.shots.length,1);
});
test('train screenshots require the actual rendered physical train kind clock position and clear camera',()=>{
 const p=plan(),expected=p.frames[0],actual={...expected,id:p.trainId,description:p.description,kind:p.kind,rendered:true,visibility:{clear:true}};
 assert.equal(verifyReplayFrame(p,expected,actual),true);
 for(const change of [{id:2},{kind:'other'},{description:'OTHER'},{timeMs:2},{point:[0,10.06]},{speedMps:2},{state:'held'},
  {reversals:1},{lengthM:25},{rendered:false},{occupied:[]},{occupied:[{a:2,b:1,fromT:0,toT:1}]},{visibility:{clear:false}}])assert.throws(()=>verifyReplayFrame(p,expected,{...actual,...change}));
});
test('train capture serves only the frozen schedule for its requested date',()=>{
 const date='2026-11-08',doc={date,calls:[{headcode:'1A01',operator:'GN'}]},frozen={anchors:'a',recording:'r',schedules:new Map([[date,doc]])};
 assert.equal(frozenTrainEndpoint('/relay/anchors',frozen).body,'a');assert.equal(frozenTrainEndpoint('/relay/recording?date=20990101',frozen).body,'r');
 const response=frozenTrainEndpoint(`/relay/schedule?date=${date}`,frozen);assert.equal(response.status,undefined);assert.deepEqual(JSON.parse(response.body),doc);
 assert.equal(frozenTrainEndpoint('/relay/schedule?date=2026-11-09',frozen).status,404);assert.equal(frozenTrainEndpoint('/relay/schedule',{}).status,404);assert.equal(frozenTrainEndpoint('/other',frozen),undefined);
});
test('frozen schedule policy verifies provenance and matches only its birth day',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/train-schedule-test-');
 const date='2026-11-08',at=Date.parse(date+'T12:00:00Z'),call={date,serviceDate:date,uid:'SYN',headcode:'1A01',operator:'GN',origin:'MOORGATE',destination:'KNGX',platform:null,arrivalMs:at,departureMs:null};
 const bytes=Buffer.from(JSON.stringify({date,calls:[call]})),capturedPath=dir+'/schedule.json';await writeFile(capturedPath,bytes,{mode:0o600});
 const entry={date,capturedPath,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},policy=await frozenSchedulePolicy([entry]);
 assert.deepEqual(policy.dates,[date]);assert.deepEqual(policy.serviceFor('1A01',at),call);assert.equal(policy.serviceFor('1A01',at-86400000),undefined);
 assert.equal(policy.serviceFor('1A01',at+91*60000),undefined);assert.equal((await frozenSchedulePolicy()).serviceFor('1A01',at),undefined);
 for(const entries of [[entry,entry],[{...entry,date:'2026-11-09'}],[{...entry,bytes:1}],[{...entry,sha256:'0'.repeat(64)}]])await assert.rejects(frozenSchedulePolicy(entries));
 const linked=dir+'/linked.json';await symlink(capturedPath,linked);await assert.rejects(frozenSchedulePolicy([{...entry,capturedPath:linked}]),/private file/);
});
test('train capture verifies immutable input fingerprints before launching a browser',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/train-capture-test-'),bytes=Buffer.from('synthetic');
 const capturedPath=dir+'/input.json';await writeFile(capturedPath,bytes);const entry={capturedPath,sha256:createHash('sha256').update(bytes).digest('hex')};
 assert.deepEqual(await frozenBytes(entry),bytes);await assert.rejects(frozenBytes({...entry,sha256:'0'.repeat(64)}),/frozen input hash mismatch/);await assert.rejects(frozenBytes({}),/missing frozen input fingerprint/);
 for(const unfingerprinted of [{capturedPath},{sha256:entry.sha256},{...entry,sha256:entry.sha256.slice(1)}])await assert.rejects(frozenBytes(unfingerprinted),/missing frozen input fingerprint/);
});
const graph=()=>({nodes:[[1,0,0],[2,0,40],[3,0,80],[4,0,120],[5,100,20],[6,100,60],[7,100,100],[8,100,120]],rails:[{id:1,nodes:[1,2],tunnel:false},{id:2,nodes:[5,6],tunnel:true},{id:3,nodes:[3,4],tunnel:false},{id:4,nodes:[7,8],tunnel:false}],platforms:[{pts:[[-2,80],[2,80],[2,120],[-2,120]]}]});
test('catalogue coach positions use fitting surface OSM track outside platform envelopes',()=>{
 const tracks=catalogueTracks(graph(),26);assert.equal(tracks.length,1);assert.deepEqual(tracks[0].edge,[1,2]);assert.equal(tracks[0].point[1],7);assert.match(tracks[0].reason,/catalogue specimen/);
 const p=plan(),points=corridorPoints(p,graph(),{anchors:[{kind:'platform',platform:'2',point:[12,34]}]});assert.equal(points.length,7);assert.deepEqual(points[0],[0,1.5,0]);assert.deepEqual(points[1],[0,1.5,40]);assert.deepEqual(points.at(-1),[12,1,34]);
});
function sceneFixture(lift=0){
 const scene=new T.Scene(),group=new T.Group(),camera=new T.PerspectiveCamera(50,1.6,.1,2000);scene.add(group);group.position.y=lift;
 const body=new T.Mesh(new T.BoxGeometry(2.7,3.1,26,1,4,26),new T.MeshBasicMaterial());body.name='body-shell';body.position.set(0,2,13);group.add(body);
 const controls={target:new T.Vector3(),enableDamping:true,minDistance:8,maxPolarAngle:1.4,update(){const d=camera.position.clone().sub(this.target);if(d.length()<this.minDistance&&d.length()>0)camera.position.copy(this.target).add(d.setLength(this.minDistance));camera.lookAt(this.target);}};
 return {scene,group,camera,controls};
}
test('coach detail camera uses real geometry and terrain and is exactly three metres from the body side',()=>{
 const {scene,group,camera,controls}=sceneFixture(10),ground={heightAt:()=>10};
 let view;assert.doesNotThrow(()=>{view=detailCamera(T,scene,camera,controls,group,ground,[0,1.85,4.4]);});
 assert.ok(Math.abs(view.distanceM-3)<1e-10);assert.ok(Math.abs(view.position[0]-4.35)<1e-6);assert.ok(Math.abs(view.target[0]-1.35)<1e-6);assert.equal(view.target[1],11.85);assert.equal(controls.minDistance,0);assert.equal(controls.enableDamping,false);assert.equal(view.visibility.clear,true);assert.ok(view.visibility.checkedSamples>=4);
 assert.throws(()=>detailCamera(T,scene,camera,controls,group,{heightAt:()=>20},[0,1.85,4.4]),/terrain/);
});
test('train sequence camera is fixed by the occupied corridor and clears the drawn terrain',()=>{
 const {camera,controls}=sceneFixture(),ground={heightAt:()=>100};const view=sequenceCamera(T,camera,controls,[[0,1,0],[0,1,200]],ground);
 assert.ok(view.position[1]>=100.5);assert.equal(view.target[2],100);assert.equal(view.groundY,100);assert.equal(camera.near,.03);assert.equal(controls.minDistance,0);
 const other=sequenceCamera(T,camera,controls,[[0,1,0],[0,1,200]],ground,1);assert.ok(view.position[0]*other.position[0]<0);
});
test('coach occlusion checks name a foreground mesh and reject tiny or clipped views',()=>{
 const {scene,group,camera,controls}=sceneFixture();const ground={heightAt:()=>0};
 setCaptureView(T,camera,controls,[40,20,13],[0,2,13],55);assert.equal(inspectTrainFrame(T,scene,camera,group,ground).clear,true);
 const wall=new T.Mesh(new T.BoxGeometry(.2,30,80),new T.MeshBasicMaterial());wall.name='synthetic-wall';wall.userData.source='fixture';wall.position.set(10,10,13);scene.add(wall);
 const blocked=inspectTrainFrame(T,scene,camera,group,ground);assert.equal(blocked.clear,false);assert.match(blocked.blocker,/synthetic-wall/);assert.equal(blocked.occluder.chain[0].userData.source,'fixture');assert.ok(blocked.occluder.distanceM<blocked.occluder.targetDistanceM);
 wall.visible=false;camera.position.set(400,200,13);camera.lookAt(0,2,13);assert.equal(inspectTrainFrame(T,scene,camera,group,ground).clear,false);
 camera.position.set(40,20,13);camera.lookAt(0,2,13);camera.fov=1;camera.updateProjectionMatrix();assert.equal(inspectTrainFrame(T,scene,camera,group,ground).clear,false);
 camera.position.y=-1;assert.match(inspectTrainFrame(T,scene,camera,group,ground).reason,/ground/);
 assert.throws(()=>trainBounds(T,new T.Group()),/no visible geometry/);
});
test('every real catalogue kind provides a clear three metre coach detail before scene occlusion is tested',()=>{
 for(const kind of ALL_KINDS){
  const {scene,camera,controls}=sceneFixture();scene.clear();const g=buildTrain(kind);scene.add(g);for(const c of g.children)c.visible=c.name==='car-0';
  const c=g.getObjectByName('car-0'),bogie=c.getObjectByName('bogie-0-0');let view;
  assert.doesNotThrow(()=>{view=detailCamera(T,scene,camera,controls,c,{heightAt:()=>0},[0,1.85,bogie.position.z]);},kind);
  assert.ok(Math.abs(view.distanceM-3)<1e-10,kind);assert.equal(view.visibility.clear,true,kind);
 }
});

test('a coach detail view samples its region by area, however the body is cut into triangles: a flank of two huge triangles frames, and so does one with a dense patch of tiny ones beside the focus',()=>{
 // A body's flank is a few triangles as long as the car, and its windows and nose are thousands of tiny ones. The sampler once took the centres of the triangles in list order: a flank
 // whose triangle centres all stand outside the region had no samples ("insufficient visible coach surface samples"), and a dense patch took all 32 samples and framed only itself.
 for(const dense of [false,true]){
  const {scene,group,camera,controls}=sceneFixture();group.children[0].geometry=new T.BoxGeometry(2.7,3.1,dense?5:26);
  if(dense){
   // 39,000 tiny triangles (6 mm2 each, just over the sampler's floor for a degenerate one), listed ahead of a 5 m shell (the way a nose's rings and lenses are): the flank's own pieces are under one per cent of the candidates
   const patch=new T.Mesh(new T.PlaneGeometry(.5,.5,140,140).rotateY(Math.PI/2),new T.MeshBasicMaterial());patch.name='body-detail';patch.position.set(1.36,2,14.5);
   const shell=group.children[0];group.remove(shell);group.add(patch,shell);
  }
  let view;assert.doesNotThrow(()=>{view=detailCamera(T,scene,camera,controls,group,{heightAt:()=>0},[0,1.85,13]);},`dense patch: ${dense}`);
  // (the 4.5 m region is 1.5 of the frame's 2.0 across at 3 m: samples that cover it span over 1.2, where a sampler that spends its picks on the patch spans 0.8)
  assert.equal(view.visibility.clear,true);assert.ok(view.visibility.screenSpan>=1.2,`dense patch ${dense}: screen span ${view.visibility.screenSpan}`);
 }
 // and only the region is sampled: a plate whose nearest edge stands 2.3 m from the focus, outside the 2.25 m region, gives it no surface, though pieces of it reach in
 const {scene,group,camera,controls}=sceneFixture();group.children[0].geometry=new T.BoxGeometry(2.7,3.1,1);group.children[0].position.set(0,2,30);
 const plate=new T.Mesh(new T.PlaneGeometry(1,3,1,1).rotateY(Math.PI/2),new T.MeshBasicMaterial());plate.name='body-detail';plate.position.set(1.36,2,15.8);group.add(plate);
 assert.throws(()=>detailCamera(T,scene,camera,controls,group,{heightAt:()=>0},[0,1.85,13]),/insufficient visible coach surface samples/);
});
test('forward captures reuse replay and seek on the simulated clock without reloading for camera or coach changes',async()=>{
 const loads=[],seeks=[],session=replaySession(async index=>{loads.push(index);return {start:1000};},async(...v)=>seeks.push(v));
 assert.equal((await session.at(0,1100)).loaded,true);assert.equal((await session.at(0,1200)).loaded,false);
 await session.at(0,1200);assert.deepEqual(loads,[0]);assert.deepEqual(seeks,[[100,1100],[200,1200]]);
 await session.at(0,1150);await session.at(1,1300);assert.deepEqual(loads,[0,0,1]);assert.deepEqual(seeks.at(-1),[300,1300]);
 await assert.rejects(session.at(1,900),/before recording/);
});
test('capture URLs retain signals and frozen S class bytes while recording the actual anchor count',()=>{
 const url=new URL(replayUrl('http://localhost',Date.UTC(2099,0,2)));
 assert.equal(url.searchParams.get('trains'),'replay');assert.equal(url.searchParams.get('date'),'20990102');assert.notEqual(url.searchParams.get('signals'),'0');
 assert.equal(url.searchParams.get('speed'),'1');assert.equal(frozenTrainEndpoint('/relay/sclass',{table:'synthetic'}).body,'synthetic');
 assert.equal(frozenTrainEndpoint('/relay/sclass',{}).status,404);
});
test('capture work has a bounded number of alternatives and records phase times even on failure',async()=>{
 const p=pack();p.captureCandidates=[...Array.from({length:9},(_,i)=>plan('arrival',i+1)),plan('departure')];let attempts=0;
 let r;await assert.doesNotReject(async()=>{r=await captureSequences(p,async c=>{if(c.direction==='arrival'){attempts++;throw new Error('blocked');}return c;});});assert.equal(attempts,6);assert.equal(r.exitCode,1);
 const timings=[];let now=10;assert.equal(await measuredPhase(timings,'seek',async()=>{now=25;return 2;},()=>now),2);
 await assert.rejects(measuredPhase(timings,'camera',async()=>{now=40;throw new Error('fixture');},()=>now));
 assert.deepEqual(timings,[{phase:'seek',elapsedMs:15},{phase:'camera',elapsedMs:15}]);
});
test('follow camera frames the actual leading coach within a few car lengths and follows its movement',()=>{
 const {scene,group,camera,controls}=sceneFixture();group.children[0].name='body-shell';
 const consist=new T.Group();scene.remove(group);scene.add(consist);group.name='car-0';consist.add(group);
 const far=group.clone();far.name='car-1';far.position.z=200;consist.add(far);
 const a=followTrainCamera(T,camera,controls,consist,[0,0],{heightAt:()=>0});assert.equal(a.coach,group);assert.ok(a.camera.distanceM<75);assert.equal(a.camera.focusCoach,'car-0');
 const clear=inspectTrainFrame(T,scene,camera,group,{heightAt:()=>0},{minScreenSpan:.3,minVerticalSpan:.08});assert.equal(clear.clear,true);
 consist.position.z=80;const b=followTrainCamera(T,camera,controls,consist,[0,80],{heightAt:()=>30});assert.equal(b.coach,group);assert.ok(b.camera.position[1]>=30.5);assert.ok(Math.abs(b.camera.target[2]-a.camera.target[2]-80)<1e-8);
 setCaptureView(T,camera,controls,[400,50,13],[0,2,13],55);assert.equal(inspectTrainFrame(T,scene,camera,group,{heightAt:()=>0},{minScreenSpan:0,minVerticalSpan:.08}).clear,false);
});
test('spatial ray chunks preserve actual large mesh intersections and original occluder identity',()=>{
 const mesh=new T.Mesh(new T.PlaneGeometry(200,100,80,40),new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.name='large-surface';mesh.position.set(10,0,-20);mesh.updateMatrixWorld(true);
 for(const x of [-70,10,80,140]){
  const ray=new T.Raycaster(new T.Vector3(x,10,50),new T.Vector3(0,0,-1));
  const expected=ray.intersectObject(mesh),actual=intersectCaptureRay(T,ray,[mesh]);assert.equal(actual.length>0,expected.length>0);
  if(actual.length){assert.equal(actual[0].object===mesh,true);assert.ok(Math.abs(actual[0].distance-expected[0].distance)<1e-8);}
 }
 mesh.geometry.setDrawRange(0,0);const ray=new T.Raycaster(new T.Vector3(10,10,50),new T.Vector3(0,0,-1));assert.equal(intersectCaptureRay(T,ray,[mesh]).length,0,'undrawn triangles cannot become occluders');
});
test('capture descriptions follow a physical train rename at each recorded frame rather than the future candidate label',()=>{
 const data={nodes:[[1,0,-1000],[2,1000,-1000]],rails:[{id:7,nodes:[1,2],service:'main',tunnel:false,bridge:false,layer:0}]};
 const anchors={area:'TEST',sources:['synthetic'],unmapped:[],anchors:[{berth:'P',kind:'platform',platform:'1',from:1,to:2,t:.9,point:[900,-1000],errorM:1,evidence:'synthetic'}]};
 const rows=[{t:1000,e:{kind:'interpose',area:'TEST',to:'P',descr:'BEFORE'}},{t:2000,e:{kind:'interpose',area:'TEST',to:'P',descr:'AFTER'}}];
 const p={captureCandidates:[{recordingIndex:0,trainId:1,description:'AFTER',frames:[{timeMs:1500},{timeMs:2500}]}]};
 const births=[];let enriched;assert.doesNotThrow(()=>{enriched=describeCaptureFrames(p,[rows],data,anchors,(description,at)=>{births.push([description,at]);return {operator:'GN',origin:'MOORGATE',destination:'KNGX'};});});
 assert.deepEqual(births,[['BEFORE',1000]],'enrichment uses the same immutable schedule resolver at physical birth');
 assert.deepEqual(enriched.captureCandidates[0].frames.map(f=>f.description),['BEFORE','AFTER']);assert.equal(p.captureCandidates[0].frames[0].description,undefined);
 const candidate=plan(),expected={...candidate.frames[0],description:'BEFORE'},actual={...expected,id:candidate.trainId,kind:candidate.kind,rendered:true,visibility:{clear:true}};
 assert.doesNotThrow(()=>assert.equal(verifyReplayFrame(candidate,expected,actual),true));assert.throws(()=>verifyReplayFrame(candidate,expected,{...actual,description:candidate.description}));
});
test('portal planning and canonical seek use the same scheduled formation',()=>{
 const nodes=[[1,0,-100],[2,0,-450],[3,0,-950],[4,0,-1300]],rails=[{id:1,nodes:[1,2]},{id:2,nodes:[2,3],tunnel:true},{id:3,nodes:[3,4]}].map(r=>({service:'main',tunnel:false,bridge:false,layer:0,ref:'ECM1',...r}));
 const anchors={area:'TEST',sources:['synthetic'],unmapped:[],anchors:[{berth:'A',kind:'signal',from:1,to:2,t:0,point:[0,-100],errorM:1,evidence:'synthetic'},{berth:'B',kind:'signal',from:3,to:4,t:1,point:[0,-1300],errorM:1,evidence:'synthetic'}]};
 const rows=[{t:1000,e:{kind:'step',area:'TEST',from:'A',to:'B',descr:'1A01'}},{t:201000,e:{kind:'heartbeat',area:'TEST'}}],births=[];
 let result;assert.doesNotThrow(()=>{result=portalCapturePlan([rows],{nodes,rails},anchors,(description,at)=>{births.push([description,at]);return {operator:'GN',origin:'MOORGATE',destination:'KNGX'};});});
 assert.equal(result.kind,'gn717x6');assert.equal(births.length,2,'planning and canonical seek must both resolve at birth');
 assert.ok(result.frames.every(f=>Math.abs(f.lengthM-trainLayout('gn717x6').length)<1e-6));
});
test('deadlines and termination signal the detached browser group and cleanup waits for descendants',async()=>{
 for(const reason of ['SIGTERM','SIGINT','deadline']){
  const proc=new EventEmitter(),timers=new Map(),signals=[];let serial=0,stop;
  const life=createCaptureLifetime({processImpl:proc,kill:(pid,sig)=>signals.push([pid,sig]),setTimer:fn=>{timers.set(++serial,fn);return serial;},clearTimer:id=>timers.delete(id),onStop:r=>stop=r});life.attach({pid:321});
  if(reason==='deadline')timers.get(1)();else proc.emit(reason);
  assert.equal(stop,reason);assert.deepEqual(signals[0],[-321,'SIGTERM']);assert.throws(()=>life.check(),/stopped/);timers.get(2)();assert.deepEqual(signals.at(-1),[-321,'SIGKILL']);
  assert.equal(proc.exitCode,reason==='deadline'?124:reason==='SIGINT'?130:143);life.dispose();assert.equal(proc.listenerCount('SIGTERM'),0);assert.equal(timers.size,0);
 }
 const signals=[],child={pid:123,exitCode:null,signalCode:null};let time=0,alive=true,removed=false;
 const cleanup=await cleanupCaptureBrowser(child,'synthetic-profile',{timeoutMs:50,now:()=>time,sleep:async ms=>{time+=ms;},warn:()=>{},kill:(pid,signal)=>{
  signals.push([pid,signal]);if(signal==='SIGTERM')child.signalCode='SIGTERM';
  if(signal==='SIGKILL')alive=false;
  if(signal===0&&!alive)throw Object.assign(new Error('gone'),{code:'ESRCH'});
 },remove:async()=>{assert.equal(alive,false,'parent exit alone must not allow profile removal');removed=true;}});
 assert.equal(cleanup.exited,true);assert.equal(removed,true);assert.ok(signals.some(([pid,sig])=>pid===-123&&sig==='SIGKILL'));assert.equal(cleanup.profileRetained,null);
 const retained=await cleanupCaptureBrowser(undefined,'synthetic-profile',{remove:async()=>{throw Object.assign(new Error('busy'),{code:'ENOTEMPTY'});},warn:()=>{}});assert.equal(retained.profileRetained,'synthetic-profile');assert.equal(retained.warnings.length,1);
});

test('portal selection requires a moving physical tail entry straddling the face in time order',()=>{
 const history=[10.4,14.3,18.2,22.1,30].map((alongM,i)=>({...frame(i*1000,2),alongM}));
 assert.deepEqual(selectPortalFrames(history),history);
 assert.equal(selectPortalFrames(history.slice(0,2)),null);
 assert.equal(selectPortalFrames(history.map(f=>({...f,speedMps:0}))),null);
 assert.equal(selectPortalFrames([...history].map(f=>({...f,timeMs:-f.timeMs}))),null);
 const p={...plan('portal-entry'),frames:history,portal:{id:'synthetic'}};
 assert.deepEqual(capturePlans({portalMode:true,captureCandidates:[p]}).requirements,['0-portal-entry']);
 assert.throws(()=>capturePlans({portalMode:true,captureCandidates:[{...p,portal:null}]}));
});
const fixedPortalCamera=()=>({position:[20,6,-40],target:[0,3,0],fov:55});
const portalMeasurements=()=>[26,20,13,6,0].map((visibleLengthM,i)=>({timeMs:i*1000,camera:fixedPortalCamera(),
 visibility:{clear:true,visibleLengthM,outsideLengthM:visibleLengthM,buriedVisibleLengthM:0,track:{visible:true,rendered:true}}}));
test('portal sequences require decreasing measured train length from one fixed exterior camera',()=>{
 const measured=portalMeasurements(),result=verifyPortalSequence(measured);
 assert.equal(result.initialVisibleLengthM,26);assert.equal(result.finalVisibleLengthM,0);assert.equal(result.decreaseM,26);
 for(const change of [m=>m[1].visibility.visibleLengthM=26,m=>m[4].visibility.visibleLengthM=7,
  m=>m[0].visibility.visibleLengthM=0,m=>m[1].visibility.clear=false,m=>m[2].camera.position[0]++,
  m=>m[2].camera.target[0]++,m=>m[2].timeMs=0,m=>m[3].visibility.visibleLengthM=NaN,
  m=>m[0].visibility.track.visible=false,m=>m[0].visibility.track.rendered=false]){
  const m=portalMeasurements();change(m);assert.throws(()=>verifyPortalSequence(m));
 }
 assert.throws(()=>verifyPortalSequence(measured.slice(0,1)));
 const tiny=portalMeasurements().slice(0,4);tiny.forEach((f,i)=>f.visibility.visibleLengthM=3-i);
 assert.throws(()=>verifyPortalSequence(tiny),/no measurable train/);
});
test('portal capture retries whole fixed-camera sequences and publishes only a complete valid sequence',async()=>{
 const frames=[10.4,14.3,18.2,22.1,30].map((alongM,i)=>({...frame(i*1000,2),alongM}));
 const p={...plan('portal-entry'),frames,portal:{id:'synthetic'}},published=[],visits=[],seeks=[];
 const result=await capturePortalFrames(p,{
  seek:async f=>seeks.push(f.timeMs),
  inspect:async(f,candidate,camera)=>{
   visits.push({candidate,fixed:camera!==undefined});
   const i=frames.indexOf(f),actual={...f,id:p.trainId,description:p.description,kind:p.kind,rendered:true,
    camera:camera??fixedPortalCamera(),visibility:portalMeasurements()[i].visibility};
   if(candidate===0&&i===1)actual.visibility={...actual.visibility,clear:false,reason:'outside body hidden',blocker:'Scene/central/timber',
    occluder:{chain:[{name:'timber',type:'Mesh',userData:{source:'synthetic'}},{name:'central',type:'Group',userData:{}}],distanceM:12.5,targetDistanceM:24}};
   return actual;
  },
  picture:async()=>Buffer.from('synthetic PNG'),
  publish:async(f,actual,bytes)=>{published.push({timeMs:f.timeMs,bytes:String(bytes)});return 'frame-'+f.timeMs;},
 });
 assert.equal(result.frames.length,5);assert.equal(result.validation.decreaseM,26);assert.equal(result.attempts.length,1);
 assert.equal(result.attempts[0].candidate,0);assert.equal(result.frames[0].candidate,1);
 assert.equal(result.attempts[0].blocker,'Scene/central/timber');assert.ok(result.attempts[0].occluder,'occluder diagnostics must survive capture failure');
 assert.equal(result.attempts[0].occluder.distanceM,12.5);
 assert.equal(result.attempts[0].occluder.chain[0].userData.source,'synthetic');
 assert.match(result.attempts[0].reason,/outside body hidden by Scene\/central\/timber at 12.500 m/);
 assert.deepEqual(seeks,[0,1000,0,1000,2000,3000,4000]);
 assert.deepEqual(visits.map(v=>v.fixed),[false,true,false,true,true,true,true]);
 assert.equal(published.length,5);assert.equal(published[0].timeMs,0);assert.equal(published[4].bytes,'synthetic PNG');
 let attempts=0;
 await assert.rejects(capturePortalFrames(p,{seek:async()=>{},inspect:async()=>{attempts++;throw new Error('solid face');},picture:async()=>{},publish:async()=>assert.fail('failed shots must stay unpublished')}),/no valid fixed-camera portal entry/);
 assert.equal(attempts,6);
 const resultAfterFlat=await capturePortalFrames(p,{seek:async()=>{},inspect:async(f,candidate,camera)=>{
  const i=frames.indexOf(f);return {...f,id:p.trainId,description:p.description,kind:p.kind,rendered:true,camera:camera??fixedPortalCamera(),
   visibility:candidate===0?{...portalMeasurements()[i].visibility,visibleLengthM:26}:portalMeasurements()[i].visibility};
 },picture:async()=>Buffer.from('synthetic'),publish:async()=>''});
 assert.equal(resultAfterFlat.frames[0].candidate,1,'clear individual frames cannot bypass the progressive entry check');
 let inspections=0;
 await assert.rejects(capturePortalFrames(p,{seek:async()=>{},inspect:async(f,candidate,camera)=>{inspections++;return {...f,id:p.trainId,description:p.description,kind:p.kind,
  rendered:true,camera:camera??fixedPortalCamera(),visibility:portalMeasurements()[frames.indexOf(f)].visibility};},picture:async()=>Buffer.from('synthetic'),
  publish:async()=>{throw new Error('filesystem unavailable');}}),/filesystem unavailable/);
 assert.equal(inspections,5,'a publication error must not retry a partial write');
});
test('every capture mode starts Chrome headless on the real Metal GPU with its own throwaway profile and never a software renderer',()=>{
 const args=chromeArgs('/tmp/profile-x');
 for(const flag of ['--headless=new','--remote-debugging-pipe','--use-angle=metal','--ignore-gpu-blocklist','--enable-gpu-rasterization','--user-data-dir=/tmp/profile-x','--no-sandbox'])assert.ok(args.includes(flag),flag);
 assert.equal(args.at(-1),'about:blank');assert.equal(args.filter(a=>a.startsWith('--user-data-dir=')).length,1);
 assert.ok(!args.some(a=>/swiftshader|disable-gpu|use-gl=|use-angle=(?!metal$)|software/i.test(a)),args.join(' '));
 assert.notDeepEqual(chromeArgs('/tmp/profile-y'),args);
});

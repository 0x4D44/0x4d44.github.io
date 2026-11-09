import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import * as THREE from 'three';
import { captureAlternatives, captureCamera, checkedInput, cdpPipe, cleanupBrowser, frozenEndpoint, manualFrames, runCapturePlans, validatePack, verifyShot } from '../signal-capture.mjs';
import { frameSignalView, inspectSignalFrame } from '../signal-framing.mjs';
const plan={headId:7,berth:'SYN',state:'unknown',startMs:100,endMs:200,timeMs:150};
const pack=()=>({states:['proceed','danger','unknown'],heads:[{id:7,berth:'SYN',decoded:true}],captures:[{recording:0,cases:[plan]}],
 inputs:{anchors:{},table:{},recordings:[{}]},intervals:[{...plan,recording:0}]});

test('signal capture rejects a case without a positioned decoded head or matching recorded interval',()=>{
 assert.equal(validatePack(pack()).length,1);
 for(const change of [p=>p.heads[0].decoded=false,p=>p.intervals=[],p=>p.captures[0].cases[0]={...plan,timeMs:200},p=>p.captures[0].cases[0]={...plan,state:'caution'}]){
  const p=pack();change(p);assert.throws(()=>validatePack(p));
 }
});
test('signal capture records a failed head tries another recorded head and continues to other states',async()=>{
 const r=pack();r.captures[0].cases=[{...plan,state:'proceed'},{...plan,state:'danger'}];
 r.intervals=r.captures[0].cases.map(c=>({...c,recording:0}));r.heads.push({id:8,berth:'ALT',decoded:true},{id:9,berth:'NO',decoded:false});
 r.intervals.push({...plan,headId:8,berth:'ALT',state:'proceed',recording:0},{...plan,headId:9,berth:'NO',state:'proceed',recording:0});
 assert.deepEqual(captureAlternatives(r,{...r.captures[0].cases[0],recording:0}).map(p=>p.headId),[7,8]);
 const calls=[];let result;
 await assert.doesNotReject(async()=>{result=await runCapturePlans(r,async p=>{calls.push([p.headId,p.state]);if(p.headId===7&&p.state==='proceed')throw Object.assign(new Error('post occluded'),{details:{blocker:'synthetic-portal'}});return p;});});
 assert.deepEqual(calls,[[7,'proceed'],[8,'proceed'],[7,'danger']]);assert.equal(result.shots.length,2);assert.equal(result.failed.length,1);
 assert.match(result.failed[0].reason,/post occluded/);assert.ok(result.failed[0].details);assert.equal(result.failed[0].details.blocker,'synthetic-portal');assert.equal(result.exitCode,0);assert.deepEqual(result.missingStates,[]);
 let missing;await assert.doesNotReject(async()=>{missing=await runCapturePlans(r,async p=>{if(p.state==='proceed')throw new Error('blocked');return p;});});
 assert.equal(missing.exitCode,1);assert.deepEqual(missing.missingStates,['proceed']);assert.equal(missing.shots.length,1);
});
test('signal capture cannot omit a supported state observed in a decoded head interval',()=>{
 const r=pack();
 r.intervals.push({...plan,state:'danger',startMs:300,endMs:500,recording:0});
 assert.throws(()=>validatePack(r),/recording 0.*danger.*no capture case/);
 r.captures[0].cases.push({...plan,state:'danger',startMs:300,endMs:500,timeMs:400});
 assert.equal(validatePack(r).length,2);
 // Proceed and caution have not been observed; the tool must not manufacture them.
 assert.equal(validatePack(pack()).length,1);
 const tooShort=pack();tooShort.intervals.push({...plan,state:'proceed',startMs:300,endMs:301,recording:0});
 assert.equal(validatePack(tooShort).length,1,'no interior capture clock exists at the minimum interval duration');
});
test('signal capture requires the observed states of each recording independently',async()=>{
 const r=pack();r.inputs.recordings.push({});r.captures.push({recording:1,cases:[{...plan}]});
 r.intervals.push({...plan,recording:1});
 let result;await assert.doesNotReject(async()=>{result=await runCapturePlans(r,async p=>{if(p.recording===0)throw new Error('first recording blocked');return p;});});
 assert.equal(result.shots.length,1);assert.equal(result.failed.length,1);
 assert.equal(result.exitCode,1,'the second recording cannot replace the first recording evidence');
 assert.deepEqual(result.missingStates,['unknown']);
 assert.deepEqual(result.missingCases,[{recording:0,state:'unknown'}]);
 assert.deepEqual(result.coverage,[{recording:0,observedStates:['unknown'],capturedStates:[],missingStates:['unknown']},
  {recording:1,observedStates:['unknown'],capturedStates:['unknown'],missingStates:[]}]);
 const complete=await runCapturePlans(r,async p=>p);assert.equal(complete.exitCode,0);assert.deepEqual(complete.missingCases,[]);
});
test('signal capture validates each callback result before counting its evidence',async()=>{
 const r=pack();
 let result;await assert.doesNotReject(async()=>{result=await runCapturePlans(r,async p=>({...p,state:'danger'}));});
 assert.equal(result.exitCode,1);assert.equal(result.shots.length,0);
 assert.equal(result.failed.length,1);
 assert.match(result.failed[0].reason,/capture result.*recorded case/);
});
test('signal screenshots require exact head state clock and an actual rendered frame',()=>{
 const expected={...plan,post:[10,0,20]},actual={id:7,berth:'SYN',state:'unknown',timeMs:150,rendered:true,post:[10,0,20],visibility:{clear:true}};assert.equal(verifyShot(expected,actual),true);
 for(const change of [{id:8},{berth:'OTHER'},{state:'danger'},{timeMs:151},{rendered:false},{post:[11,0,20]},{visibility:{clear:false,reason:'housing occluded'}},{visibility:null}])assert.throws(()=>verifyShot(expected,{...actual,...change}));
 const visibility={clear:false,reason:'post-top occluded',blocker:'Scene/portal/stone',occluder:{distanceM:2}};
 assert.throws(()=>verifyShot(expected,{...actual,visibility}),error=>{assert.match(error.message,/Scene\/portal\/stone at 2 m/);assert.deepEqual(error.details,visibility);return true;});
});
test('signal capture frames advance only by the requested replay clock and honor cancellation',()=>{
 const window={};runInNewContext(`(${manualFrames.toString()})()`,{window});const seen=[];
 const id=window.requestAnimationFrame(t=>seen.push(t));window.cancelAnimationFrame(id);window.__signalFrame(0);assert.deepEqual(seen,[]);
 window.requestAnimationFrame(t=>{seen.push(t);window.requestAnimationFrame(t=>seen.push(t));});window.__signalFrame(12);assert.deepEqual(seen,[12]);window.__signalFrame(12);assert.deepEqual(seen,[12,12]);
});
function signalScene(lift=0) {
 const scene=new THREE.Scene(),group=new THREE.Group(),camera=new THREE.PerspectiveCamera(50,1.6,.1,1000);group.name='synthetic-head';group.position.y=lift;scene.add(group);
 const mesh=(geometry,name,x,y,z)=>{const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());m.name=name;m.position.set(x,y,z);group.add(m);return m;};
 mesh(new THREE.BoxGeometry(.65,1.15,.28),'housing',0,3.8,0);mesh(new THREE.SphereGeometry(.19,8,6),'aspect',0,3.95,.18);
 mesh(new THREE.CylinderGeometry(.09,.12,3.7,6),'post',0,1.85,0);
 return {scene,group,camera};
}
test('signal capture camera sits in front of the real lamp face',()=>{
 const {scene,group,camera}=signalScene();group.position.set(10,17,20);group.rotation.y=Math.PI;
 let c;assert.doesNotThrow(()=>{c=captureCamera(THREE,scene,camera,group);});
 assert.ok(c.position[2]<20);assert.ok(c.target[1]>20&&c.target[1]<22);assert.ok(c.position[1]>17);
 assert.ok(c.near>0&&c.fov<=65);assert.equal(c.visibility.clear,true);assert.ok(c.visibility.checkedSamples>=27);
});
test('signal capture removes the overview orbit clamp before framing and keeps the actual camera close',()=>{
 const {scene,group,camera}=signalScene(),controls={target:new THREE.Vector3(),minDistance:8,maxPolarAngle:1.5,enableDamping:true,
  update(){const delta=camera.position.clone().sub(this.target);camera.position.copy(this.target).add(delta.clampLength(this.minDistance,3000));camera.lookAt(this.target);}};
 let view;assert.doesNotThrow(()=>{view=frameSignalView(THREE,scene,camera,controls,group);});
 assert.equal(controls.minDistance,0);assert.equal(controls.enableDamping,false);assert.ok(camera.position.distanceTo(controls.target)<8);
 assert.deepEqual(view.position,camera.position.toArray());assert.equal(view.visibility.clear,true);
 camera.position.sub(controls.target).multiplyScalar(10).add(controls.target);camera.lookAt(controls.target);
 assert.equal(inspectSignalFrame(THREE,scene,camera,group).clear,false,'a tiny distant head is not a readable capture');
});
test('signal capture derives camera height from scene geometry and the drawn terrain',()=>{
 const {scene,group,camera}=signalScene(12),ground={heightAt:()=>16.2};
 let c;assert.doesNotThrow(()=>{c=captureCamera(THREE,scene,camera,group,ground);});
 assert.ok(c.position[1]>=ground.heightAt()+.25);assert.ok(c.target[1]>14.7);
 assert.equal(c.visibility.groundY,ground.heightAt());assert.equal(inspectSignalFrame(THREE,scene,camera,group,ground).clear,true);
 camera.position.y=ground.heightAt()-.1;assert.equal(inspectSignalFrame(THREE,scene,camera,group,ground).clear,false);
});
test('signal capture rejects a portal covering the housing even when the lamp is clear and finds a clear offset',()=>{
 const {scene,group,camera}=signalScene();let original;
 assert.doesNotThrow(()=>{original=captureCamera(THREE,scene,camera,group);});
 const arch=new THREE.Mesh(new THREE.BoxGeometry(4,2,.1),new THREE.MeshBasicMaterial());arch.name='synthetic-portal';arch.position.set(-2.08,3.7,.7);scene.add(arch);scene.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(camera.position,group.getObjectByName('aspect').getWorldPosition(new THREE.Vector3()).sub(camera.position).normalize());
 assert.equal(ray.intersectObjects(scene.children,true)[0].object.name,'aspect','lamp alone gives a misleading clear result');
 const blocked=inspectSignalFrame(THREE,scene,camera,group);assert.equal(blocked.clear,false);assert.match(blocked.reason,/housing|post/);
 assert.ok(blocked.occluder);assert.ok(blocked.occluder.chain.length);assert.equal(blocked.occluder.chain[0].name,'synthetic-portal');
 assert.ok(blocked.occluder.distanceM>0&&blocked.occluder.distanceM<blocked.occluder.targetDistanceM);assert.equal(blocked.occluder.point.length,3);
 let clear;assert.doesNotThrow(()=>{clear=captureCamera(THREE,scene,camera,group);});
 assert.ok(clear.attempts>1);assert.notDeepEqual(clear.position,original.position);assert.equal(clear.visibility.clear,true);
 arch.visible=false;assert.doesNotThrow(()=>captureCamera(THREE,scene,camera,group));
});
test('signal capture fails loudly when every approach view is blocked or the head is clipped',()=>{
 const {scene,group,camera}=signalScene();assert.doesNotThrow(()=>captureCamera(THREE,scene,camera,group));
 camera.fov=1;camera.updateProjectionMatrix();assert.equal(inspectSignalFrame(THREE,scene,camera,group).clear,false);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(30,30,.05),new THREE.MeshBasicMaterial());wall.name='synthetic-face';wall.userData.source='synthetic';wall.position.set(0,3.7,.5);scene.add(wall);
 assert.throws(()=>captureCamera(THREE,scene,camera,group),error=>{
  assert.match(error.message,/No unobstructed approach-side view.*synthetic-head.*synthetic-face.*target/);assert.ok(error.details);
  const occluder=error.details.failures.find(f=>f.visibility.occluder)?.visibility.occluder;assert.ok(occluder);assert.ok(occluder.chain.length);assert.equal(occluder.chain[0].userData.source,'synthetic');return true;
 });
});
test('signal capture requires the lamp itself to be the first surface on its sightline',()=>{
 const {scene,group,camera}=signalScene();assert.doesNotThrow(()=>captureCamera(THREE,scene,camera,group));
 const shroud=new THREE.Mesh(new THREE.BoxGeometry(1,1,.05),new THREE.MeshBasicMaterial());shroud.position.set(0,3.95,.5);group.add(shroud);
 const result=inspectSignalFrame(THREE,scene,camera,group);assert.equal(result.clear,false);assert.match(result.reason,/lamp hidden by its own housing/);
});
test('signal capture waits for browser exit before removing its temporary profile',async()=>{
 const child=new EventEmitter();Object.assign(child,{pid:123,exitCode:null,signalCode:null});const order=[];
 child.kill=signal=>{order.push(signal);setTimeout(()=>{order.push('exit');child.signalCode=signal;child.emit('exit');},5);};
 const result=await cleanupBrowser(child,'synthetic-profile',{timeoutMs:100,remove:async()=>{order.push('remove');},warn:()=>assert.fail('unexpected warning')});
 assert.deepEqual(order,['SIGTERM','exit','remove']);assert.equal(result.profileRetained,null);assert.equal(result.exited,true);
});
test('signal capture retains a failed-cleanup profile with a warning without failing successful shots',async()=>{
 const warnings=[],child={exitCode:0};let options,result;
 await assert.doesNotReject(async()=>{result=await cleanupBrowser(child,'synthetic-profile',{remove:async(_p,o)=>{options=o;throw Object.assign(new Error('busy'),{code:'ENOTEMPTY'});},warn:message=>warnings.push(message)});});
 assert.equal(result.profileRetained,'synthetic-profile');assert.equal(result.exited,true);assert.equal(warnings.length,1);assert.match(warnings[0],/ENOTEMPTY.*retained.*synthetic-profile/);assert.equal(options.maxRetries,3);
});
test('signal capture escalates a stuck browser and never removes its live profile',async()=>{
 const child=new EventEmitter();Object.assign(child,{pid:123,exitCode:null,signalCode:null});const signals=[],warnings=[];let removed=false;child.kill=signal=>signals.push(signal);
 const result=await cleanupBrowser(child,'synthetic-profile',{timeoutMs:5,remove:async()=>{removed=true;},warn:m=>warnings.push(m)});
 assert.deepEqual(signals,['SIGTERM','SIGKILL']);assert.equal(removed,false);assert.equal(result.exited,false);assert.equal(result.profileRetained,'synthetic-profile');assert.equal(warnings.length,1);
});
test('signal capture serves only frozen inputs and never queries a changing relay',()=>{
 const frozen={anchors:'a',table:'t',recording:'r'};
 assert.equal(frozenEndpoint('/relay/anchors',frozen).body,'a');assert.equal(frozenEndpoint('/relay/sclass',frozen).body,'t');
 assert.equal(frozenEndpoint('/relay/recording?date=20990101',frozen).body,'r');assert.equal(frozenEndpoint('/relay/schedule',frozen).status,404);
 assert.equal(frozenEndpoint('/kings-cross/',frozen),undefined);
});
test('signal capture verifies the frozen input hash and rejects path injection',async()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url)),base=await mkdtemp(`${root}/.scratch/signal-capture-test-`),dir=`${base}/pack`,bytes=Buffer.from('synthetic');
 await mkdir(dir);await writeFile(`${base}/input.json`,bytes);
 await writeFile(`${dir}/input.json`,bytes);const entry={file:'input.json',sha256:createHash('sha256').update(bytes).digest('hex')};
 assert.deepEqual(await checkedInput(dir,entry),bytes);await assert.rejects(checkedInput(dir,{...entry,sha256:'0'.repeat(64)}));
 await assert.rejects(checkedInput(dir,{...entry,file:'../input.json'}));
});
test('signal capture CDP transport resolves a response and fails pending commands on browser exit',async()=>{
 const child=new EventEmitter();child.stdio=[null,null,null,new PassThrough(),new PassThrough()];const cdp=cdpPipe(child);
 const p=cdp.send('Synthetic.test');const sent=JSON.parse(child.stdio[3].read().toString().replace('\0',''));assert.equal(sent.method,'Synthetic.test');
 child.stdio[4].write(JSON.stringify({id:sent.id,result:{ok:true}})+'\0');assert.deepEqual(await p,{ok:true});
 const failed=cdp.send('Synthetic.pending');child.emit('exit');await assert.rejects(failed,/CDP closed/);await assert.rejects(cdp.send('Synthetic.after'),/CDP closed/);
});

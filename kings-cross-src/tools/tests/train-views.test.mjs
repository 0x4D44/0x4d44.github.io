// Catalogue mode (rubric-FROZEN-v1): the pure pose maths of every required view V01-V10, the neutral stage, the per-view checks, the run
// loop that turns a failing view into a recorded GAP, frozen poses and argv. No Chrome and no GPU: the pictures themselves are checked by hand.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {deflateSync,crc32} from 'node:zlib';
import {mkdir,mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as T from 'three';
import {ALL_KINDS,TRAIN_SPECS,trainLayout} from '../../core/train.ts';
import {PLATFORM_HEIGHT} from '../../core/scene.ts';
import {pointInPolygon} from '../../core/station.ts';
import {buildTrain,bodySpec,carPlan} from '../../web/src/train.ts';
import {trainNight} from '../../web/src/train-geom.ts';
import * as F from '../train-framing.mjs';
import * as C from '../train-capture.mjs';

const D2R=Math.PI/180,SUN=Math.atan2(-320,260)/D2R;
const wrapDeg=a=>{let r=((a%360)+360)%360;return r>180?r-360:r;};
const near=(a,b,tol=1e-6,note='')=>assert.ok(Math.abs(a-b)<=tol,`${note} ${a} is not ${b}`);
const vec=(a,b,tol=1e-6,note='')=>{assert.equal(a.length,b.length,note);a.forEach((v,i)=>near(v,b[i],tol,`${note}[${i}]`));};
const formations=new Map(ALL_KINDS.map(kind=>[kind,C.describeFormation(kind)]));
const plans=new Map(ALL_KINDS.map(kind=>[kind,F.planCatalogueViews(formations.get(kind))]));
const any=(kind,suffix)=>{const v=plans.get(kind).find(x=>x.suffix===suffix);assert.ok(v,`${kind} has no ${suffix}`);return v;};
/** A planned view that must be OK, so a test reading its pose fails an assertion (not a TypeError) when a mutation turns it into a GAP. */
const view=(kind,suffix)=>{const v=any(kind,suffix);assert.equal(v.status,'OK',`${kind}/${suffix} is ${v.status}: ${v.reason}`);return v;};
const mirror=(p,L)=>[-p[0],p[1],L-p[2]];
const AT300=['lner5','lner9','hull5','lumo5'];
// written out, not read from the tool, so a changed word is a failed test
const LNER_NOTE='the model draws the car pattern shared by these classes; it does not distinguish the bi-mode 800 from the electric 801 (no underfloor engines, one roof/pantograph pattern); it is not claimed to match either variant';
const CLASSES={lner5:'800/2, 801/1',lner9:'800/1, 801/2',hull5:'802/3',lumo5:'803',gn387x4:'387',gn387x8:'387 x2',gn387x12:'387 x3',gn717x6:'717',gc180x5:'180',tl700x8:'700/0',tl700x12:'700/1'};

test('catalogue plans every required view of every kind once, in rubric order, as OK, GAP or N/A with a reason',()=>{
 const expected=F.STAGE_VIEWS.flatMap(([id,suffixes])=>suffixes.map(s=>[id,s]));
 assert.equal(expected.length,33);assert.deepEqual(F.VIEW_IDS,['V01','V02','V03','V04','V05','V06','V07','V08','V09','V10']);
 for(const kind of ALL_KINDS) {
  const views=plans.get(kind);assert.deepEqual(views.map(v=>[v.id,v.suffix]),expected,kind);
  for(const v of views) {
   assert.ok(['OK','GAP','N/A'].includes(v.status),`${kind}/${v.suffix}`);
   if(v.status==='OK') {
    assert.ok([...v.eye,...v.target,...v.up,v.fov,v.near,v.rotation.rotationY,...v.region.min,...v.region.max].every(Number.isFinite),`${kind}/${v.suffix}`);
    assert.ok(v.near>=.03&&v.near<=4,`${kind}/${v.suffix} near ${v.near}`);assert.equal(v.rotation.ruleId,'sun-bearing-v1');
   } else {assert.ok(v.reason.length>20,`${kind}/${v.suffix} reason`);assert.equal(v.eye,undefined);}
  }
 }
});

test('V01 nose three-quarter views stand 4.5 m out and 5 m ahead at eye height 1.7, and the rear ones reverse the whole train frame',()=>{
 for(const kind of ALL_KINDS) {
  const L=formations.get(kind).length;
  for(const [suffix,x] of [['nose-34-left',-4.5],['nose-34-right',4.5]]) {const v=view(kind,suffix);vec(v.eye,[x,1.7,-5],1e-9,kind+suffix);vec(v.target,[0,1.7,1.5],1e-9);assert.equal(v.fov,50);assert.equal(v.frame,'front');}
  for(const [suffix,x] of [['rear-nose-34-left',-4.5],['rear-nose-34-right',4.5]]) {
   const v=view(kind,suffix);vec(v.eye,mirror([x,1.7,-5],L),1e-9,kind+suffix);vec(v.target,mirror([0,1.7,1.5],L),1e-9);assert.equal(v.fov,50);assert.equal(v.frame,'rear');
   // the rear view's own left is the train's right: x is mirrored along with z
   assert.ok(Math.sign(v.eye[0])===-Math.sign(x));
  }
 }
});

test('V02 stands 3 m from the nose at eye height, front and rear',()=>{
 for(const kind of ALL_KINDS) {
  const L=formations.get(kind).length,f=view(kind,'front-3m'),r=view(kind,'rear-3m');
  vec(f.eye,[0,1.7,-3],1e-9);vec(f.target,[0,1.7,0],1e-9);vec(r.eye,[0,1.7,L+3],1e-9);vec(r.target,[0,1.7,L],1e-9);assert.equal(f.fov,50);assert.equal(r.fov,50);
  near(Math.hypot(...f.eye.map((v,i)=>v-f.target[i])),3,1e-9);near(Math.hypot(...r.eye.map((v,i)=>v-r.target[i])),3,1e-9);
 }
});

test('V03 stands exactly 3.000 m from the body side at the leading bogie and at the door and window junction of car 1',()=>{
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),layout=trainLayout(kind),half=bodySpec(layout.spec.family).half;
  for(const [suffix,side] of [['cab-side-3m',-1],['cab-side-3m-right',1]]) {
   const v=view(kind,suffix);vec(v.eye,[side*(half+3),1.85,layout.cars[0].bogies[0]],1e-9,kind+suffix);vec(v.target,[side*half,1.85,layout.cars[0].bogies[0]],1e-9);assert.equal(v.fov,65);
   near(Math.abs(v.eye[0])-half,3,1e-9,'3.000 m from the side');assert.equal(v.car.index,0);
  }
  const car1=layout.cars[1],doorZ=car1.start+carPlan(car1,layout.spec.family).doors[0],dw=bodySpec(layout.spec.family).doorWidth,centre=(car1.start+car1.end)/2;
  const expected=doorZ+Math.sign(centre-doorZ)*(dw/2+.9);
  for(const [suffix,side] of [['window-door-3m-left',-1],['window-door-3m-right',1]]) {
   const v=view(kind,suffix);vec(v.eye,[side*(half+3),1.85,expected],1e-6,kind+suffix);vec(v.target,[side*half,1.85,expected],1e-6);assert.equal(v.fov,65);assert.equal(v.car.index,1);
   assert.ok(v.eye[2]>car1.start&&v.eye[2]<car1.end);near(v.notes.junction.z,expected,1e-6);
  }
 }
});

test('V04 sets the distance once from the car length so the car spans at most 84% of the image width at aspect 1.6',()=>{
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),n=f.cars.length;
  for(const [prefix,index] of [['cab-car-side',0],['rear-cab-car-side',n-1],['intermediate-car-side',1]]) for(const [side,sx] of [['left',-1],['right',1]]) {
   const v=view(kind,`${prefix}-${side}`),car=f.cars[index],z=(car.start+car.end)/2;
   assert.equal(v.fov,25);near(v.eye[1],1.9,1e-9);near(v.eye[2],z,1e-6);vec(v.target,[0,1.9,z],1e-6);assert.equal(v.car.index,index);assert.equal(v.car.type,car.type);
   const camera=new T.PerspectiveCamera(25,1.6,.5,5000);camera.position.set(...v.eye);camera.up.set(0,1,0);camera.lookAt(new T.Vector3(...v.target));camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
   const ends=[car.start,car.end].map(zz=>new T.Vector3(sx*f.half,1.9,zz).project(camera).x);
   near(Math.max(...ends.map(Math.abs)),.84,1e-3,`${kind}/${prefix}-${side} spans 84% of the width`);assert.ok(Math.max(...ends.map(Math.abs))<=.84+1e-9,'never over 84%');
   assert.equal(v.extents.scope,'car');assert.equal(v.extents.car,index);
  }
 }
});

test('V05 whole-train side views look at mid-train from the distance that gives 8% margins',()=>{
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind);
  for(const [side,sx] of [['left',-1],['right',1]]) {
   const v=view(kind,`whole-side-${side}`);assert.equal(v.fov,25);vec(v.target,[0,1.9,f.length/2],1e-6);near(v.eye[1],1.9,1e-9);near(v.eye[2],f.length/2,1e-6);
   near(Math.abs(v.eye[0])-f.half,F.fitDistance(f.length,25),1e-3,'distance from length and aspect');assert.equal(Math.sign(v.eye[0]),sx);assert.equal(v.extents.scope,'train');
  }
 }
});

test('V06 roof views aim at the first and last pantograph, or the middle car where the train has none, and the plan fits the train with 8% margins',()=>{
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),L=f.length,H=f.roofTop,panto=f.cars.filter(c=>c.pantograph),mid=f.cars[Math.floor(f.cars.length/2)];
  const first=panto.length?(panto[0].pantograph[0]+panto[0].pantograph[1])/2:(mid.start+mid.end)/2,last=panto.length?(panto.at(-1).pantograph[0]+panto.at(-1).pantograph[1])/2:(mid.start+mid.end)/2;
  const front=view(kind,'roof-front'),rear=view(kind,'roof-rear'),plan=view(kind,'roof-plan');
  vec(front.eye,[5.5,8,first-2],1e-6,kind);vec(front.target,[0,H,first],1e-6);assert.equal(front.fov,50);
  vec(rear.eye,mirror([5.5,8,L-last-2],L),1e-6,kind);vec(rear.target,mirror([0,H,L-last],L),1e-6);assert.equal(rear.fov,50);
  assert.equal(panto.length===0,kind==='gc180x5','only the Class 180 has no pantograph');
  vec(plan.up,[1,0,0]);assert.equal(plan.fov,50);vec(plan.target,[0,H,L/2],1e-6);near(plan.eye[0],0,1e-9);near(plan.eye[2],L/2,1e-6);near(plan.eye[1]-H,F.fitDistance(L,50),1e-3,'height for 8% margins');
 }
 assert.match(view('gc180x5','roof-front').notes.source,/no pantograph/);assert.match(view('lner5','roof-front').notes.source,/pantograph centre/);
});

test('V07 shows a motor bogie and a trailer bogie where the model has both, and says so where every bogie is a motor bogie',()=>{
 for(const kind of ALL_KINDS) {
  const layout=trainLayout(kind),f=formations.get(kind);
  const find=motor=>{for(const car of layout.cars)for(const k of [0,1])if(car.motor[k]===motor)return {car,z:car.bogies[k]};return null;};
  for(const [suffix,motor] of [['bogie-motor',true],['bogie-trailer',false]]) {
   const v=any(kind,suffix),want=find(motor);
   if(want) {assert.equal(v.status,'OK');vec(v.eye,[-(f.half+3),.65,want.z],1e-6,kind+suffix);vec(v.target,[0,.55,want.z],1e-6);assert.equal(v.fov,50);assert.equal(v.car.index,want.car.index);assert.equal(v.notes.motor,motor);}
   else {assert.equal(v.status,'GAP');assert.match(v.reason,/motor/);}
  }
  const u=view(kind,'underframe'),c1=(layout.cars[1].start+layout.cars[1].end)/2;vec(u.eye,[-(f.half+3),.8,c1],1e-6);vec(u.target,[0,.7,c1],1e-6);
  for(const v of plans.get(kind).filter(x=>x.id==='V07'&&x.status==='OK'))assert.ok(v.eye[1]>CATALOGUE_GROUND()+.25,'never below the ground');
 }
 // CHANGED: the Azuma kinds were pinned as GAP here, the model giving every bogie of theirs a motor. They now run trailer bogies under the driving cars and the TS
 // (core/train.ts AT300_TRAILER_CARS), so every kind shows both a motor and a trailer bogie: on an Azuma the first trailer bogie is the front driving car's
 // and the first motor bogie is car 1's.
 for(const kind of ALL_KINDS)for(const suffix of ['bogie-motor','bogie-trailer'])assert.equal(any(kind,suffix).status,'OK',kind+suffix);
 for(const kind of AT300){assert.equal(any(kind,'bogie-trailer').car.index,0,kind);assert.equal(any(kind,'bogie-motor').car.index,1,kind);}
 // the GAP stays where a train has no such bogie in the model: every bogie a motor bogie, or none
 const withFlags=(kind,motor)=>F.planCatalogueViews({...formations.get(kind),cars:formations.get(kind).cars.map(c=>({...c,motor:[motor,motor]}))});
 for(const kind of ALL_KINDS) {
  const noTrailer=withFlags(kind,true).find(v=>v.suffix==='bogie-trailer'),noMotor=withFlags(kind,false).find(v=>v.suffix==='bogie-motor');
  assert.equal(noTrailer.status,'GAP',kind);assert.match(noTrailer.reason,/no trailer bogie/);assert.equal(noTrailer.eye,undefined);
  assert.equal(noMotor.status,'GAP',kind);assert.match(noMotor.reason,/traction motors/);assert.equal(noMotor.eye,undefined);
 }
});
const CATALOGUE_GROUND=()=>F.CATALOGUE.groundY;

test('V08 stands 2 m from the side at the first joint and the joint nearest mid-train, and finds the Class 387 unit couplings',()=>{
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),joints=F.jointsOf(f),g=view(kind,'gangway'),mid=view(kind,'gangway-mid'),low=view(kind,'coupling-low');
  vec(g.eye,[f.half+2,1.8,joints[0].z],1e-6);vec(g.target,[0,1.6,joints[0].z],1e-6);assert.equal(g.fov,50);assert.equal(g.notes.between[0],0);
  vec(low.eye,[f.half+2,1.2,joints[0].z-1.5],1e-6);vec(low.target,[0,.85,joints[0].z],1e-6);
  const ordinary=joints.filter(j=>!j.unit),best=ordinary.reduce((b,j)=>!b||Math.abs(j.z-f.length/2)<Math.abs(b.z-f.length/2)-1e-6?j:b,null);
  vec(mid.eye,[f.half+2,1.8,best.z],1e-6);assert.equal(mid.notes.joint.index,best.index);assert.ok(!mid.notes.joint.unit,'mid-train gangway is an ordinary joint');
  const units=joints.filter(j=>j.unit);assert.equal(units.length,{gn387x8:1,gn387x12:2}[kind]??0,kind);
  for(const [k,suffix] of [[0,'unit-coupling'],[1,'unit-coupling-2']]) {
   const s=any(kind,suffix),l=any(kind,suffix+'-low');
   if(units[k]) {vec(s.eye,[f.half+2,1.8,units[k].z],1e-6);vec(s.target,[0,1.6,units[k].z],1e-6);vec(l.eye,[f.half+2,1.2,units[k].z-1.5],1e-6);vec(l.target,[0,.85,units[k].z],1e-6);}
   else {assert.equal(s.status,'N/A');assert.equal(l.status,'N/A');assert.match(s.reason,/unit/);}
  }
 }
 assert.deepEqual(F.jointsOf(formations.get('gn387x8')).filter(j=>j.unit).map(j=>j.index),[3]);
 assert.deepEqual(F.jointsOf(formations.get('gn387x12')).filter(j=>j.unit).map(j=>j.index),[3,7]);
 // lner5 has two joints exactly as near mid-train as each other: the lower index wins
 assert.equal(view('lner5','gangway-mid').notes.joint.index,1);near(view('lner5','gangway-mid').notes.joint.z,51.85,1e-6);
 // gn387x8's mid-train joint is the unit coupling; the ordinary joint nearest it (two tie) is car 2's end
 assert.equal(view('gn387x8','gangway-mid').notes.joint.index,2);
});

test('V09 uses the V02 pose in the leading and trailing lamp states, asks the page for the state objects, and is a functional GAP while the page has no lamp switch',()=>{
 // CHANGED (lamp state objects): the state is what setTrainLampState(group, { front, rear }) takes, written out here; it was the word leading or trailing
 const states={leading:{front:'head',rear:'tail'},trailing:{front:'tail',rear:'head'}};
 for(const kind of ALL_KINDS) {
  const front=view(kind,'front-3m');
  for(const [name,state] of Object.entries(states)) {
   const v=view(kind,`lights-${name}`);vec(v.eye,front.eye,1e-9);vec(v.target,front.target,1e-9);assert.equal(v.fov,front.fov);
   assert.equal(v.capability?.function,'setTrainLampState');assert.deepEqual(v.capability?.state,state);assert.equal(v.notes.state,name);assert.match(v.capability?.reason,/no window\.__kx\.setTrainLampState\(group, \{ front, rear \}\)/);
  }
 }
 assert.deepEqual(F.LAMP_STATES,states);assert.ok(Object.isFrozen(F.LAMP_STATES)&&Object.isFrozen(F.LAMP_STATES.leading)&&Object.isFrozen(F.LAMP_STATES.trailing));
 // the plan hands out its own copy of a state, so a page that edits the object it is given cannot change the next plan's
 const fresh=F.planCatalogueViews(formations.get('lner5')).find(x=>x.suffix==='lights-leading');
 assert.doesNotThrow(()=>{fresh.capability.state.front='off';},'the plan holds a copy it can edit');assert.equal(F.LAMP_STATES.leading.front,'head');assert.equal(F.planCatalogueViews(formations.get('lner5')).find(x=>x.suffix==='lights-leading').capability.state.front,'head');
});

test('the dusk lamp views are the day lamp views under a name of their own and stand where they stand; every other view keeps its name in both passes',()=>{
 for(const kind of ALL_KINDS) {
  const planned=plans.get(kind),day=planned.map(v=>F.viewForExposure(v,'day')),dusk=planned.map(v=>F.viewForExposure(v,'dusk'));
  day.forEach((v,i)=>assert.equal(v,planned[i],`${kind}/${planned[i].suffix}: a day pass takes every view as planned`));
  assert.deepEqual(dusk.filter(v=>v.id==='V09').map(v=>v.suffix),['lights-leading-dusk','lights-trailing-dusk'],`${kind}: the lamp views at dusk`);
  assert.deepEqual(dusk.map(v=>v.suffix).filter(x=>!x.startsWith('lights-')),planned.map(v=>v.suffix).filter(x=>!x.startsWith('lights-')),`${kind}: no other view is renamed`);
  planned.forEach((v,i)=>{
   if(v.id!=='V09'){assert.equal(dusk[i],v,`${kind}/${v.suffix} keeps its name at dusk`);return;}
   const w=dusk[i];assert.equal(w.poseSuffix,v.suffix);assert.deepEqual(F.poseOf(w),F.poseOf(v),'the same pose');assert.deepEqual(w.capability,v.capability);assert.equal(w.notes.exposure,'dusk');assert.equal(w.notes.state,v.notes.state);assert.deepEqual(w.rotation,v.rotation);
   assert.equal(v.suffix.endsWith('-dusk'),false,'the planned view is not edited');assert.equal(v.poseSuffix,undefined);assert.equal(v.notes.exposure,undefined);
  });
 }
 // the frozen entry of a view: under its own name, else under the name its pose is shared with, else none
 const held={views:{'lights-leading':{plan:'day'},'lights-leading-dusk':{plan:'dusk'},'lights-trailing':{plan:'day trailing'}}};
 const lamp=F.viewForExposure(any('lner5','lights-leading'),'dusk'),twin=F.viewForExposure(any('lner5','lights-trailing'),'dusk');
 assert.equal(F.frozenEntryOf(held,lamp),held.views['lights-leading-dusk'],'a dusk manifest holds its own entry');assert.equal(F.frozenEntryOf(held,twin),held.views['lights-trailing'],'a day manifest holds the pose under the day name');
 assert.equal(F.frozenEntryOf(held,any('lner5','lights-leading')),held.views['lights-leading']);assert.equal(F.frozenEntryOf(held,any('lner5','front-3m')),undefined);assert.equal(F.frozenEntryOf(undefined,twin),undefined);assert.equal(F.frozenEntryOf({views:{}},twin),undefined);
 assert.equal(F.frozenEntryOf({views:{'front-3m':{plan:1}}},any('lner5','front-3m')).plan,1,'a view with no pose twin is found by its own name only');
 // a dusk pass over a day manifest: no drift when the poses are the day's, and a drift named for the dusk view when one moved
 const plansOf=kinds=>new Map(kinds.map(kind=>[kind,{views:plans.get(kind).map(v=>F.viewForExposure(v,'dusk'))}]));
 const manifest=frozenManifest(['lner5']);assert.deepEqual(C.frozenPoseDrift(C.loadFrozenPoses(JSON.stringify(manifest)),plansOf(['lner5'])),[]);
 manifest.kinds.lner5.views['lights-leading'].plan.eye[2]=-3.001;
 assert.deepEqual(C.frozenPoseDrift(C.loadFrozenPoses(JSON.stringify(manifest)),plansOf(['lner5'])).map(d=>[d.view,d.reason,d.at]),[['lights-leading-dusk','pose differs from the frozen pose','/eye/2']]);
 delete manifest.kinds.lner5.views['lights-trailing'];
 assert.ok(C.frozenPoseDrift(C.loadFrozenPoses(JSON.stringify(manifest)),plansOf(['lner5'])).some(d=>d.view==='lights-trailing-dusk'&&d.reason==='view missing from the frozen poses'));
});

test('stage rotation turns the specimen so the sun sits within 15 degrees of the camera bearing, as a pure function of the local pose',()=>{
 const sunAz=Math.atan2(-320,260)/D2R;near(F.stageRotation(view('lner5','front-3m')).sunAzimuthDeg,sunAz,1e-5);
 for(const kind of ALL_KINDS) for(const v of plans.get(kind).filter(x=>x.status==='OK')) {
  const r=F.stageRotation(v),again=F.stageRotation({eye:[...v.eye],target:[...v.target],suffix:'other'});assert.deepEqual(r,again,'depends only on eye and target');assert.deepEqual(r,v.rotation);
  const plan=Math.hypot(v.eye[0]-v.target[0],v.eye[2]-v.target[2])<1e-6,local=plan?135:Math.atan2(v.eye[0]-v.target[0],v.eye[2]-v.target[2])/D2R;
  near(Math.abs(wrapDeg(local+r.rotationYDeg-sunAz)),Math.abs(r.appliedOffsetDeg),1e-4,`${kind}/${v.suffix} world camera bearing is the sun azimuth less the offset`);
  assert.ok(Math.abs(r.appliedOffsetDeg)<=15+1e-9);assert.equal(r.basis,plan?'plan-upper-left-diagonal':'camera-bearing');
 }
 // a front three-quarter view from the left: camera bearing -145.3 deg, nudged toward the left axis
 const left=F.stageRotation({eye:[-4.5,1.7,-5],target:[0,1.7,1.5]});near(left.cameraBearingLocalDeg,Math.atan2(-4.5,-6.5)/D2R,1e-5);near(left.appliedOffsetDeg,15,1e-9);
 const right=F.stageRotation({eye:[4.5,1.7,-5],target:[0,1.7,1.5]});near(right.appliedOffsetDeg,-15,1e-9);
 // a camera on a lateral axis is already facing the sun's side: no nudge
 near(F.stageRotation({eye:[3.4,1.8,10],target:[0,1.6,10]}).appliedOffsetDeg,0,1e-9);
 // a camera 5.7 degrees short of the right-hand axis: the nudge stops on the axis, it does not overshoot to 15
 const short=F.stageRotation({eye:[10,1,1],target:[0,1,0]});near(short.appliedOffsetDeg,90-Math.atan2(10,1)/D2R,1e-5);near(short.cameraBearingLocalDeg+short.appliedOffsetDeg,90,1e-5);
 assert.deepEqual(F.stageRotation({eye:[0,100,0],target:[0,0,0]}),F.stageRotation({eye:[0,50,0],target:[0,0,0]}),'a plan view has no bearing');
});

test('fit distance and near plane are the arithmetic the views rely on',()=>{
 const camera=new T.PerspectiveCamera(25,1.6,.5,5000);
 for(const [extent,fov] of [[25.85,25],[129.7,25],[233.7,50]]) {
  const d=F.fitDistance(extent,fov),c=new T.PerspectiveCamera(fov,1.6,.5,5000);c.position.set(0,0,d);c.lookAt(0,0,0);c.updateMatrixWorld(true);c.updateProjectionMatrix();
  near(new T.Vector3(extent/2,0,0).project(c).x,.84,1e-9,'half the extent at 84% of the half width');
 }
 assert.ok(camera);near(F.fitDistance(10,25,1.6,1),10/(2*Math.tan(12.5*D2R)*1.6),1e-12);
 assert.equal(F.catalogueNear([0,1.7,-3],[0,1.7,0]),.03);assert.equal(F.catalogueNear([0,0,0],[0,0,4000]),4);near(F.catalogueNear([0,0,0],[0,0,217]),2.17,1e-9);
 assert.deepEqual(F.reverseFrame([-4.5,1.7,-5],100),[4.5,1.7,105]);assert.equal(Object.is(F.reverseFrame([0,1,100],100)[2],-0),false);
});

test('V10 candidate cameras stand on a platform exactly the asked distance from the focus, at platform height plus 1.7 m',()=>{
 const platform={ref:'X',pts:[[10,-5],[40,-5],[40,5],[10,5]]};
 for(const distance of [25,75,150]) {
  const focusXZ=[0,0],candidates=F.stationCandidates({focusXZ,distanceM:distance,platforms:[{ref:'X',pts:platform.pts},{ref:'Y',pts:[[-8,-200],[-5,-200],[-5,200],[-8,200]]}],inside:pointInPolygon,stepDeg:1});
  assert.ok(candidates.length>0,`candidates at ${distance}`);
  for(const c of candidates) {
   assert.ok(pointInPolygon(c.xz,c.platform==='X'?platform.pts:[[-8,-200],[-5,-200],[-5,200],[-8,200]]),'over its platform');
   near(Math.hypot(c.xz[0]-focusXZ[0],c.xz[1]-focusXZ[1]),distance,1e-9);
   const pose=F.stationPose({candidate:c,focus:[0,1.7,0],distanceM:distance});near(pose.eye[1],PLATFORM_HEIGHT+1.7,1e-12);near(pose.horizontalDistanceM,distance,1e-6);assert.equal(pose.fov,50);assert.equal(pose.near,distance/100,'the near plane is a hundredth of the distance, like every catalogue view');
   assert.deepEqual([pose.platform,pose.azimuthDeg,pose.up],[c.platform,c.azimuthDeg,[0,1,0]]);vec(pose.target,[0,1.7,0]);
  }
 }
 const ordered=F.stationCandidates({focusXZ:[0,0],distanceM:25,platforms:[{ref:'X',pts:platform.pts}],inside:pointInPolygon,stepDeg:1,preferredBearingsDeg:[100]});
 assert.equal(ordered[0].azimuthDeg,100);assert.deepEqual(ordered.map(c=>c.azimuthDeg).slice(0,3),[100,99,101].sort((a,b)=>Math.abs(a-100)-Math.abs(b-100)||a-b));
 const c=ordered[0];assert.throws(()=>F.stationPose({candidate:{...c,xz:[c.xz[0]+.01,c.xz[1]]},focus:[0,1.7,0],distanceM:25}),/not 25 m/);
 near(F.stationPose({candidate:c,focus:[0,1.7,0],distanceM:25,platformHeightM:1.1}).eye[1],2.8,1e-12,'a sampled platform height replaces the default');
 assert.equal(F.CATALOGUE.platformHeightM,PLATFORM_HEIGHT,'the capture constant is the page constant');
});

// ---- the neutral stage and the page-side helpers -------------------------------------------------------------------------------------
test('the specimen stage is a ground, a 3.4 m ballast strip, one instanced sleeper mesh and two rail heads at the tread centres, 60 m past each end',()=>{
 const stage=F.buildCatalogueStage(T,{length:100}),byName=n=>stage.getObjectByName(n);
 assert.equal(stage.name,'capture-stage');assert.equal(stage.userData.captureOwned,true);
 const box=o=>new T.Box3().setFromObject(o),rails=['left','right'].map(s=>byName(`capture-stage-rail-${s}`)),ballast=box(byName('capture-stage-ballast')),ground=box(byName('capture-stage-ground'));
 near(box(rails[0]).max.y,0,1e-9,'rail head top is the zero level');near(box(rails[1]).max.y,0,1e-9);near(box(rails[0]).getCenter(new T.Vector3()).x,-.7175,1e-9);near(box(rails[1]).getCenter(new T.Vector3()).x,.7175,1e-9);
 for(const r of rails){near(box(r).min.z,-60,1e-9);near(box(r).max.z,160,1e-9);}
 near(ballast.max.x-ballast.min.x,3.4,1e-5,'float32 positions');near(ballast.min.z,-60,1e-5);near(ballast.max.z,160,1e-5);assert.ok(ground.max.y<ballast.max.y&&ballast.max.y<0,'ground under ballast under the rails');assert.ok(ground.max.x-ground.min.x>1000);
 const sleepers=byName('capture-stage-sleepers');assert.ok(sleepers.isInstancedMesh);assert.equal(sleepers.count,Math.floor(220/.65));assert.equal(stage.children.filter(o=>o.isInstancedMesh).length,1);
 const lowest=new T.Matrix4();sleepers.getMatrixAt(0,lowest);near(new T.Vector3().setFromMatrixPosition(lowest).z,-60+.325,1e-5);
 assert.equal(stage.userData.levels.railHeadTopY,0);assert.equal(stage.userData.levels.ballastWidthM,3.4);assert.equal(stage.userData.levels.sleepers,sleepers.count);
});

test('hiding the scenery hides every non-light scene child, keeps the lights and the stage, and reports the names',()=>{
 const scene=new T.Scene(),light=new T.DirectionalLight(),shed=Object.assign(new T.Group(),{name:'train-shed'}),sky=new T.Mesh(),sprite=Object.assign(new T.Sprite(),{name:'platform-4'}),stage=F.buildCatalogueStage(T,{length:10}),off=Object.assign(new T.Group(),{name:'already'});off.visible=false;
 scene.add(light,shed,sky,sprite,stage,off);
 const hidden=F.hideSceneryForStage(scene);
 assert.deepEqual(F.describeObjects(hidden),[{name:'train-shed',type:'Group'},{name:'',type:'Mesh'},{name:'platform-4',type:'Sprite'}]);
 assert.equal(light.visible,true);assert.equal(stage.visible,true);assert.ok([shed,sky,sprite].every(o=>!o.visible));assert.equal(off.visible,false);
});

test('train costs count visible meshes as the rubric cost script does: draw-range triangles, one draw per visible material group',()=>{
 const reference=group=>{let triangles=0,drawCalls=0;group.traverseVisible(o=>{if(!o.isMesh)return;const g=o.geometry,n=Math.min(g.drawRange.count,(g.index?.count??g.attributes.position.count)-g.drawRange.start);
  if(!o.material||n<=0)return;const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.every(m=>m.visible===false||m.opacity===0))return;
  if(Array.isArray(o.material)&&g.groups.length){for(const part of g.groups)if(o.material[part.materialIndex]?.visible!==false){drawCalls++;triangles+=part.count/3;}}else{drawCalls++;triangles+=n/3;}});return {triangles,drawCalls};};
 const group=new T.Group(),add=(mesh,visible=true)=>{mesh.visible=visible;group.add(mesh);return mesh;};
 add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()));
 const materials=Array.from({length:6},()=>new T.MeshBasicMaterial());materials[2].visible=false;add(new T.Mesh(new T.BoxGeometry(),materials));
 add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()),false);add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({transparent:true,opacity:0})));
 const ranged=new T.BoxGeometry();ranged.setDrawRange(0,6);add(new T.Mesh(ranged,new T.MeshBasicMaterial()));
 assert.deepEqual(F.trainCosts(group),{triangles:12+10+2,drawCalls:1+5+1});assert.deepEqual(F.trainCosts(group),reference(group));
 for(const kind of ['lner5','gn387x8']){const train=buildTrain(kind);assert.deepEqual(F.trainCosts(train),reference(train),kind);assert.ok(F.trainCosts(train).triangles>10000);}
});

test('a catalogue view is set through the specimen transform: the eye and target follow the group, a plan view takes the train axis as image up',()=>{
 const group=new T.Group(),camera=new T.PerspectiveCamera(50,1.6,.03,9000),controls={target:new T.Vector3(),update(){}};
 group.position.set(100,0,-40);group.rotation.set(0,1.1,0);
 const v=view('lner5','nose-34-left'),pose=F.setCatalogueView(T,camera,controls,group,v),want=group.localToWorld(new T.Vector3(...v.eye));
 vec(pose.position,want.toArray(),1e-9);vec(camera.position.toArray(),want.toArray(),1e-9);assert.equal(camera.fov,50);assert.equal(camera.near,v.near);near(pose.positionErrorM,0,1e-9);
 vec(controls.target.toArray(),group.localToWorld(new T.Vector3(...v.target)).toArray(),1e-9);
 const plan=view('lner5','roof-plan');F.setCatalogueView(T,camera,controls,group,plan);
 const axis=new T.Vector3(1,0,0).transformDirection(group.matrixWorld);vec(camera.up.toArray(),axis.toArray(),1e-9,'image up is the train x axis');
 const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0),forward=new T.Vector3(0,0,1).transformDirection(group.matrixWorld);near(right.dot(forward),1,1e-9,'image right is toward the tail, so the nose is at the left of the image');
 F.setCatalogueView(T,camera,controls,group,v);vec(camera.up.toArray(),[0,1,0],1e-9,'a following view returns up to +y');
});

// ---- the per-view geometry check ---------------------------------------------------------------------------------------------------------
function checkFixture(extra=()=>{}) {
 const scene=new T.Scene(),group=new T.Group(),car=new T.Group();car.name='car-0';group.add(car);scene.add(group);
 const shell=new T.Mesh(new T.BoxGeometry(2.7,3.1,26),new T.MeshBasicMaterial());shell.name='body-shell';shell.position.set(0,2,13);car.add(shell);
 const camera=new T.PerspectiveCamera(50,1.6,.03,3000),controls={target:new T.Vector3(),update(){}},ground={heightAt:()=>-.2};extra({scene,group,car});
 return {scene,group,camera,controls,ground};
}
const side=(x,over={})=>({eye:[x,2,13],target:[0,2,13],fov:50,up:[0,1,0],near:.1,region:{min:[-1.6,.6,7],max:[1.6,3.4,19]},...over});
function inspect(f,v,options){F.setCatalogueView(T,f.camera,f.controls,f.group,v);return F.inspectCatalogueView(T,f.scene,f.camera,f.group,f.ground,v,options);}

test('a clear view passes and reports the samples it checked and the surface points it saw',()=>{
 const f=checkFixture(),r=inspect(f,side(12));
 assert.equal(r.clear,true,JSON.stringify(r));assert.ok(r.checkedSamples>=20&&r.checkedSamples<=64);assert.ok(r.visibleFraction>=.99);assert.equal(r.groundY,-.2);assert.ok(r.screenSpan>.3);
 assert.equal(r.sampleNdc.length,Math.round(r.visibleFraction*r.checkedSamples));assert.ok(r.sampleNdc.every(([x,y])=>Math.abs(x)<=.91&&Math.abs(y)<=.91));
});

test('a view whose camera is under the ground clearance, inside a mesh, behind an obstacle or hidden by the train itself is not clear, and says why',()=>{
 let f=checkFixture();f.ground={heightAt:()=>1.9};assert.match(inspect(f,side(12)).reason,/ground clearance/);
 f=checkFixture(({scene})=>{const solid=new T.Mesh(new T.BoxGeometry(6,6,6),new T.MeshBasicMaterial());solid.name='plant-room';solid.position.set(12,2,13);scene.add(solid);});
 let r=inspect(f,side(12));assert.equal(r.clear,false);assert.equal(r.reason,'camera inside a mesh');assert.match(r.blocker,/plant-room/);
 f=checkFixture(({scene})=>{const wall=new T.Mesh(new T.BoxGeometry(.3,10,80),new T.MeshBasicMaterial());wall.name='platform-screen';wall.position.set(6,5,13);scene.add(wall);});
 r=inspect(f,side(12));assert.equal(r.clear,false);assert.equal(r.reason,'coach occluded');assert.match(r.blocker,/platform-screen/);assert.ok(r.occluder.distanceM<r.occluder.targetDistanceM);
 f=checkFixture(({car})=>{const other=new T.Mesh(new T.BoxGeometry(.3,8,30),new T.MeshBasicMaterial());other.name='body-shell';other.position.set(6,2,13);car.add(other);});
 r=inspect(f,side(12));assert.equal(r.clear,false);assert.equal(r.reason,'viewed region hidden behind other parts of the train');assert.ok(r.visibleFraction<.2);
});

test('a view is rejected when its region leaves the frame margin, is too small, has no surface, or when a whole-car subject is over 84% or under 70% of its limit',()=>{
 const f=checkFixture();
 assert.equal(inspect(f,side(12,{region:{min:[-1.6,.6,-2],max:[1.6,3.4,28]}})).reason,'viewed region outside the frame margin');
 assert.equal(inspect(f,side(900,{region:{min:[-1.6,.6,10],max:[1.6,3.4,16]}})).reason,'viewed region too small in frame');
 assert.equal(inspect(f,side(12,{region:{min:[-1.6,30,7],max:[1.6,34,19]}})).reason,'insufficient visible train surface in the viewed region');
 const wide=inspect(f,side(20,{region:{min:[-1.6,.6,10],max:[1.6,3.4,16]},extents:{scope:'train'}}));assert.equal(wide.clear,false);assert.match(wide.reason,/exceeds 84%/);assert.ok(wide.extents.widthFraction>.84);
 const thin=inspect(f,side(40,{region:{min:[-1.6,.6,4],max:[1.6,3.4,22]},extents:{scope:'train'}}));assert.equal(thin.clear,false);assert.equal(thin.reason,'subject too small in frame');
 const fitted=inspect(f,side(1.35+F.fitDistance(26,50),{region:{min:[-1.6,.6,10],max:[1.6,3.4,16]},fov:50,extents:{scope:'car',car:0}}));
 assert.equal(fitted.clear,true,JSON.stringify(fitted).slice(0,300));assert.ok(fitted.extentsNdc.widthFraction<=.84+1e-6&&fitted.extentsNdc.widthFraction>.8);
});

test('every planned view of an Azuma, an Electrostar and the pantograph-less Adelante is clear on the neutral stage, and one moved inside the train is not',()=>{
 for(const kind of ['lner5','gn387x8','gc180x5']) {
  const group=buildTrain(kind),scene=new T.Scene(),stage=F.buildCatalogueStage(T,{length:formations.get(kind).length});scene.add(stage,group);
  const camera=new T.PerspectiveCamera(50,1.6,.03,9000),controls={target:new T.Vector3(),update(){}},ground={heightAt:()=>F.CATALOGUE.groundY};let checked=0;
  for(const v of plans.get(kind).filter(x=>x.status==='OK'&&!x.capability)) {
   F.placeStageSpecimen(group,stage,v.rotation.rotationY);const pose=F.setCatalogueView(T,camera,controls,group,v),r=F.inspectCatalogueView(T,scene,camera,group,ground,v);
   assert.equal(r.clear,true,`${kind}/${v.suffix}: ${JSON.stringify(r).slice(0,300)}`);near(pose.positionErrorM,0,1e-9);checked++;
  }
  assert.ok(checked>=26,`${kind} checked ${checked}`);
  const v={...view(kind,'bogie-motor'),eye:[0,1.7,15]};F.placeStageSpecimen(group,stage,v.rotation.rotationY);F.setCatalogueView(T,camera,controls,group,v);
  const r=F.inspectCatalogueView(T,scene,camera,group,ground,v);assert.equal(r.clear,false,kind);assert.equal(r.reason,'camera inside a mesh');
 }
});

// ---- pictures: what changed from the empty stage ---------------------------------------------------------------------------------------
const pngChunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),8+data.length);return out;};
/** A truecolour PNG; `paint(x, y)` returns [r, g, b] for a pixel that is not the background. */
function png(width,height,paint=()=>null,background=[40,50,70]) {
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const raw=Buffer.alloc((width*3+1)*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const c=paint(x,y)??background,o=y*(width*3+1)+1+x*3;raw[o]=c[0];raw[o+1]=c[1];raw[o+2]=c[2];}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);
}
const rectangle=(x0,x1,y0,y1,W=200,H=100)=>png(W,H,(x,y)=>x>=x0&&x<=x1&&y>=y0&&y<=y1?[200,40,40]:null);

test('pixel diff names the pixels that changed from the empty stage, ignoring a change of 10 levels or less',()=>{
 const base=png(100,60),d=C.pixelDiff(png(100,60,(x,y)=>x>=10&&x<30&&y>=20&&y<30?[200,40,40]:null),base);
 assert.equal(d.changed,200);assert.deepEqual(d.bbox,{x0:10,y0:20,x1:29,y1:29});near(d.fraction,200/6000,1e-12);near(d.widthFraction,.2,1e-12);
 assert.equal(d.marginLeftPx,10);assert.equal(d.marginRightPx,70);assert.equal(d.mask[20*100+10],1);assert.equal(d.mask[0],0);assert.equal(d.mask.length,6000);
 assert.equal(C.pixelDiff(png(100,60,()=>[50,60,80]),base).changed,0,'exactly 10 levels on every channel is not a change');
 for(const c of [[51,50,70],[40,61,70],[40,50,81],[29,50,70]])assert.equal(C.pixelDiff(png(100,60,()=>c),base).changed,6000,`${c} is`);
 const same=C.pixelDiff(base,base);assert.equal(same.bbox,null);assert.equal(same.changed,0);assert.equal(same.widthFraction,0);assert.equal(same.marginLeftPx,null);
 assert.throws(()=>C.pixelDiff(png(100,61),base),/differ in size/);assert.throws(()=>C.pixelDiff(png(101,60),base),/differ in size/);
});

test('sample hits count the seen surface points that land on a pixel that differs from the empty stage',()=>{
 const d=C.pixelDiff(png(100,60,(x,y)=>x>=10&&x<30&&y>=20&&y<30?[200,40,40]:null),png(100,60)),ndc=(px,py)=>[(px+.5)/100*2-1,1-(py+.5)/60*2];
 const r=C.sampleHits(d,[ndc(15,25),ndc(29,29),ndc(30,30),ndc(31,31),ndc(80,5)]);
 // (30,30) touches the corner pixel (29,29), so it counts; (31,31) is two pixels off; (80,5) is far away
 assert.deepEqual([r.hits,r.total],[3,5]);near(r.rate,.6,1e-12);assert.deepEqual(C.sampleHits(d,[]),{hits:0,total:0,rate:0});
 assert.deepEqual(C.sampleHits(d,[[-1.5,0],[0,2]]),{hits:0,total:2,rate:0},'points outside the frame never hit');
});

test('the pixel verdict refuses an empty picture, a picture that does not show the checked surface, and a whole-car view off its margins',()=>{
 const W=200,H=100,base=png(W,H),diff=shot=>C.pixelDiff(shot,base),plain={suffix:'x'},whole={suffix:'y',extents:{scope:'car',car:0}},ndc=(px,py)=>[(px+.5)/W*2-1,1-(py+.5)/H*2];
 let v=C.pixelVerdict(plain,diff(base));assert.equal(v.ok,false);assert.match(v.reason,/only 0 pixels differ/);
 v=C.pixelVerdict(plain,diff(rectangle(0,28,30,30)));assert.equal(v.ok,false);assert.match(v.reason,/only 29 pixels/);
 v=C.pixelVerdict(plain,diff(rectangle(0,29,30,30)));assert.equal(v.ok,true);assert.equal(v.changedPixels,30);
 const shot=diff(rectangle(50,100,30,70));
 v=C.pixelVerdict(plain,shot);assert.equal(v.ok,true);assert.equal(v.changedPixels,51*41);near(v.changedFraction,51*41/(W*H),1e-12);assert.deepEqual(v.bbox,{x0:50,y0:30,x1:100,y1:70});
 v=C.pixelVerdict(plain,shot,shot,{sampleNdc:[ndc(60,40),ndc(70,50),ndc(150,10),ndc(160,10)]});assert.equal(v.ok,true);assert.deepEqual([v.sampleHits.hits,v.sampleHits.total],[2,4]);
 v=C.pixelVerdict(plain,shot,shot,{sampleNdc:[ndc(60,40),ndc(150,10),ndc(160,10),ndc(170,10)]});assert.equal(v.ok,false);assert.match(v.reason,/1 of 4 seen sample points/);
 // a whole-car or whole-train view: 84% of 200 px plus 3 px of slack is 171 px, and the margins are 8% less 3 px: 13 px
 const subject=(x0,x1)=>C.pixelVerdict(whole,diff(rectangle(x0,x1,30,70)));
 assert.equal(subject(20,179).ok,true);near(subject(20,179).subjectWidthFraction,.8,1e-12);assert.deepEqual(subject(20,179).subjectBbox,{x0:20,y0:30,x1:179,y1:70});
 assert.equal(subject(14,184).ok,true,'171 px is the widest');assert.match(subject(14,185).reason,/172 of 200 px, over the 84% limit/);
 assert.equal(subject(13,160).ok,true,'a 13 px margin is the least');assert.match(subject(12,160).reason,/margin 12 px is under 8%/);assert.match(subject(40,187).reason,/margin 12 px is under 8%/);assert.equal(subject(40,186).ok,true);
 // the subject is judged on its own picture (the car alone), not on the whole shot that has other cars in it
 assert.equal(C.pixelVerdict(whole,diff(rectangle(0,199,30,70)),diff(rectangle(20,179,30,70))).ok,true);
 v=C.pixelVerdict(whole,diff(rectangle(50,100,30,70)),diff(base));assert.equal(v.ok,false);assert.match(v.reason,/subject alone leaves no pixels/);
 assert.equal(C.pixelVerdict(plain,diff(rectangle(0,199,30,70))).ok,true,'a view with no extents may fill the frame');
});

// ---- the run loop: a failing view is a GAP that is recorded, never retried and never replaced -------------------------------------------
test('a view that fails its check becomes a recorded GAP: checked once, never photographed, never retried with another pose',async()=>{
 const calls={inspect:[],shoot:[],verify:[],publish:[]},views=[{id:'V01',suffix:'blocked',status:'OK'},{id:'V01',suffix:'fine',status:'OK'},{id:'V08',suffix:'na',status:'N/A',reason:'single unit'},
  {id:'V07',suffix:'model-gap',status:'GAP',reason:'every bogie is a motor bogie'},{id:'V09',suffix:'lamps',status:'OK',capability:{reason:'no lamp switch'}},{id:'V02',suffix:'dim',status:'OK'}];
 const fixture=checkFixture(({scene})=>{const wall=new T.Mesh(new T.BoxGeometry(.3,10,80),new T.MeshBasicMaterial());wall.name='platform-screen';wall.position.set(6,5,13);scene.add(wall);});
 const results=await C.runCatalogueViews(views,{
  inspect:async view=>{calls.inspect.push(view.suffix);return view.suffix==='blocked'?inspect(fixture,side(12)):{clear:true,checkedSamples:30,visibleFraction:1};},
  shoot:async view=>{calls.shoot.push(view.suffix);return {shot:view.suffix};},
  verify:async view=>{calls.verify.push(view.suffix);return view.suffix==='dim'?{ok:false,reason:'picture shows no specimen'}:{ok:true};},
  publish:async view=>{calls.publish.push(view.suffix);return `${view.suffix}.png`;},
  unavailable:view=>view.capability?view.capability.reason:null,now:(()=>{let t=0;return()=>t+=5;})()});
 assert.deepEqual(calls,{inspect:['blocked','fine','dim'],shoot:['fine','dim'],verify:['fine','dim'],publish:['fine']});
 assert.deepEqual(results.map(r=>[r.view.suffix,r.status]),[['blocked','GAP'],['fine','OK'],['na','N/A'],['model-gap','GAP'],['lamps','GAP'],['dim','GAP']]);
 const [blocked,fine,na,modelGap,lamps,dim]=results;
 assert.equal(blocked.reason,'coach occluded');assert.match(blocked.blocker,/platform-screen/);assert.equal(blocked.attempts,1);assert.equal(blocked.inspection.clear,false);assert.equal(blocked.file,undefined);
 assert.equal(fine.file,'fine.png');assert.deepEqual(fine.timingsMs,{inspect:5,shoot:5,verify:5});assert.equal(fine.attempts,1);
 assert.equal(na.reason,'single unit');assert.equal(na.attempts,0);assert.equal(modelGap.reason,'every bogie is a motor bogie');assert.equal(modelGap.attempts,0);
 assert.equal(lamps.reason,'no lamp switch');assert.equal(lamps.functional,true);assert.equal(lamps.attempts,0);
 assert.equal(dim.reason,'picture shows no specimen');assert.equal(dim.file,undefined);assert.equal(dim.attempts,1);
});

test('the run loop checks the deadline before each view, and a thrown error stops the kind instead of becoming a GAP',async()=>{
 let checks=0;const views=[{suffix:'a',status:'OK'},{suffix:'b',status:'N/A'},{suffix:'c',status:'OK'}];
 await C.runCatalogueViews(views,{check:()=>checks++,inspect:async()=>({clear:true}),shoot:async()=>({}),verify:async()=>({ok:true}),publish:async()=>'f'});
 assert.equal(checks,3);
 await assert.rejects(C.runCatalogueViews(views,{check:()=>{throw new Error('deadline');},inspect:async()=>({clear:true}),shoot:async()=>({}),verify:async()=>({ok:true}),publish:async()=>'f'}),/deadline/);
 await assert.rejects(C.runCatalogueViews(views,{inspect:async()=>{throw new Error('page crashed');},shoot:async()=>({}),verify:async()=>({ok:true}),publish:async()=>'f'}),/page crashed/);
 const noReason=await C.runCatalogueViews([{suffix:'a',status:'OK'}],{inspect:async()=>({clear:false}),shoot:async()=>({}),verify:async()=>({ok:true}),publish:async()=>'f'});
 assert.equal(noReason[0].reason,'view not clear');assert.equal(noReason[0].blocker,null);
});

// ---- argv ---------------------------------------------------------------------------------------------------------------------------------
test('catalogue argv takes known options once with values, in rubric order, and a timeout inside the cap',()=>{
 const base=['--mode','catalogue','--dist','d','--out','o'],parse=extra=>C.parseCatalogueArgs([...base,...extra]);
 const defaults=parse([]);assert.deepEqual(defaults.kinds,ALL_KINDS);assert.deepEqual(defaults.views,F.VIEW_IDS);assert.equal(defaults.chrome,null);assert.equal(defaults.poses,null);assert.equal(defaults.exposure,'day','the default exposure is the day rig of the earlier rounds');assert.equal(defaults.timeoutMs,1800000);assert.equal(defaults.dist,'d');assert.equal(defaults.out,'o');
 const picked=parse(['--kinds','tl700x8,lner5','--views','V04,V01','--chrome','none','--poses','m.json','--timeout-seconds','90']);
 assert.deepEqual(picked.kinds,['lner5','tl700x8'],'catalogue order, not argv order');assert.deepEqual(picked.views,['V01','V04']);assert.equal(picked.chrome,'none');assert.equal(picked.poses,'m.json');assert.equal(picked.timeoutMs,90000);
 assert.equal(parse(['--timeout-seconds','3600']).timeoutMs,3600000);assert.equal(parse(['--exposure','dusk']).exposure,'dusk');assert.equal(parse(['--exposure','day']).exposure,'day');
 for(const [extra,message] of [[['--kinds','lner5,nope'],/--kinds: unknown nope/],[['--kinds','lner5,,hull5'],/unknown \(empty\)/],[['--kinds','lner5,lner5'],/lner5 repeated/],[['--views','V11'],/--views: unknown V11/],[['--views','v01'],/unknown v01/],
   [['--bogus','1'],/unknown catalogue option --bogus/],[['--kinds','lner5','--kinds','hull5'],/repeated catalogue option --kinds/],[['--kinds'],/missing value for --kinds/],[['--kinds','--views','V01'],/missing value for --kinds/],
   [['--exposure','noon'],/--exposure: unknown noon; expected day,dusk/],[['--exposure','day','--exposure','dusk'],/repeated catalogue option --exposure/],[['--exposure'],/missing value for --exposure/],[['--timeout-seconds','0'],/positive and at most 3600/],[['--timeout-seconds','-5'],/positive/],[['--timeout-seconds','abc'],/positive/],[['--timeout-seconds','3601'],/at most 3600/],[['--chrome',''],/missing value for --chrome/]])
  assert.throws(()=>parse(extra),message,extra.join(' '));
 assert.throws(()=>C.parseCatalogueArgs(['--mode','catalogue','--out','o']),/missing --dist/);assert.throws(()=>C.parseCatalogueArgs(['--mode','catalogue','--dist','d']),/missing --out/);
 assert.throws(()=>C.parseCatalogueArgs(['--mode','portal','--dist','d','--out','o']),/--mode must be catalogue/);assert.throws(()=>C.parseCatalogueArgs(['--dist','d','--out','o']),/--mode must be catalogue/);
 assert.throws(()=>C.parseCatalogueArgs([...base,'--motion','m.json']),/unknown catalogue option --motion/);
});

// ---- frozen poses ---------------------------------------------------------------------------------------------------------------------------
const frozenManifest=kinds=>JSON.parse(JSON.stringify({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:Object.fromEntries(kinds.map(kind=>[kind,{views:Object.fromEntries(plans.get(kind).map(v=>[v.suffix,{plan:F.poseOf(v)}]))}]))}));
const planMap=kinds=>new Map(kinds.map(kind=>[kind,{kind,views:plans.get(kind)}]));

test('frozen poses are accepted only from a catalogue manifest, and any pose that moved is reported with where',()=>{
 for(const [text,message] of [['{','not JSON'],['[]','must be a'],[JSON.stringify({rubric:'other',schema:'kx-catalogue-manifest/1',kinds:{}}),'must be a'],[JSON.stringify({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/2',kinds:{}}),'must be a'],[JSON.stringify({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1'}),'must be a']])
  assert.throws(()=>C.loadFrozenPoses(text),new RegExp(message),text);
 const kinds=['lner5','gn387x8'],frozen=C.loadFrozenPoses(JSON.stringify(frozenManifest(kinds)));
 assert.deepEqual(C.frozenPoseDrift(frozen,planMap(kinds)),[],'the poses a run derives match the ones it froze, through a JSON round trip');
 assert.deepEqual(C.frozenPoseDrift(frozen,planMap(['gn387x8'])),[]);
 const moved=(change,tol)=>{const m=frozenManifest(kinds);change(m.kinds.lner5.views);return C.frozenPoseDrift(C.loadFrozenPoses(JSON.stringify(m)),planMap(kinds),tol===undefined?{}:{tol});};
 assert.deepEqual(moved(v=>{v['front-3m'].plan.eye[2]-=1e-9;}),[],'a nanometre is inside the tolerance');
 const drift=moved(v=>{v['front-3m'].plan.eye[2]-=.001;});assert.equal(drift.length,1);assert.deepEqual([drift[0].kind,drift[0].view,drift[0].reason,drift[0].at],['lner5','front-3m','pose differs from the frozen pose','/eye/2']);
 assert.equal(moved(v=>{v['whole-side-left'].plan.fov=24;})[0]?.at,'/fov');assert.equal(moved(v=>{v['roof-plan'].plan.up=[0,1,0];})[0]?.at,'/up/0');assert.equal(moved(v=>{v['cab-side-3m'].plan.rotationY+=.01;})[0]?.at,'/rotationY');
 assert.equal(moved(v=>{v['bogie-motor'].plan.status='GAP';})[0]?.at,'/status');assert.equal(moved(v=>{v['cab-car-side-left'].plan.extents.scope='train';})[0]?.at,'/extents/scope');
 assert.equal(moved(v=>{v['front-3m'].plan.eye[2]-=.001;},.01).length,0,'a wider tolerance accepts it');
 assert.deepEqual(moved(v=>{delete v['front-3m'];}).map(d=>[d.view,d.reason]),[['front-3m','view missing from the frozen poses']]);
 assert.deepEqual(C.frozenPoseDrift(frozen,planMap(['lner5','hull5'])).map(d=>[d.kind,d.reason]),[['hull5','kind missing from the frozen poses']]);
});

test('freezing a view uses the frozen numbers exactly and keeps the rest of the plan',()=>{
 const v=view('lner5','nose-34-left'),entry={plan:JSON.parse(JSON.stringify(F.poseOf(v)))};
 entry.plan.eye[0]-=3e-9;entry.plan.rotationY+=2e-9;
 const frozen=C.freezeView(v,entry);assert.equal(frozen.eye[0],entry.plan.eye[0]);assert.equal(frozen.rotation.rotationY,entry.plan.rotationY);assert.equal(frozen.rotation.ruleId,'sun-bearing-v1');
 assert.deepEqual([frozen.id,frozen.suffix,frozen.notes,frozen.car],[v.id,v.suffix,v.notes,v.car]);assert.notEqual(frozen.eye[0],v.eye[0]);
 const whole=view('lner5','cab-car-side-left'),again=C.freezeView(whole,{plan:JSON.parse(JSON.stringify(F.poseOf(whole)))});assert.deepEqual(again.extents,whole.extents);vec(again.eye,whole.eye,1e-12);
 assert.equal(C.freezeView(v,undefined),v);assert.equal(C.freezeView(v,{}),v);
});

test('catalogue preflight plans the views without Chrome, and refuses to capture on poses that differ from the frozen ones',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/train-views-test-'),log=console.log;
 try {
  const dist=path.join(dir,'dist'),out=path.join(dir,'out');await mkdir(dist);
  const run=async(...args)=>{const lines=[];console.log=(...a)=>lines.push(a.join(' '));try{await C.catalogueMain(['--mode','catalogue','--dist',dist,'--out',out,'--chrome','none',...args]);}finally{console.log=log;}return lines.map(l=>JSON.parse(l));};
  /** A run that is expected to succeed: whatever it throws instead is an assertion failure, not a crash. */
  const ok=async(...args)=>{try{return await run(...args);}catch(e){assert.fail(`catalogueMain threw: ${e?.message}`);}};
  const [plain]=await ok('--kinds','gn387x8,lner5','--views','V01,V08');
  assert.deepEqual([plain.catalogue,plain.rubric,plain.kinds,plain.views,plain.posesFrozen],[true,F.CATALOGUE.rubric,['lner5','gn387x8'],['V01','V08'],false]);
  assert.deepEqual(plain.planned,{lner5:{OK:7,'N/A':4},gn387x8:{OK:9,'N/A':2}});
  const [v10only]=await ok('--kinds','lner5','--views','V10');assert.deepEqual(v10only.planned,{lner5:{OK:6}},'the six station views have cameras over platforms to be searched');
  const [both]=await ok('--kinds','lner5','--views','V02,V10');assert.deepEqual(both.planned,{lner5:{OK:8}});
  const poses=path.join(dir,'manifest.json');await writeFile(poses,JSON.stringify(frozenManifest(['lner5','gn387x8'])));
  const [frozen]=await ok('--kinds','lner5,gn387x8','--views','V01,V08','--poses',poses);assert.equal(frozen.posesFrozen,true);assert.deepEqual(frozen.planned,plain.planned);
  // a dusk pass reuses the poses of a day pass, so poses cannot change between exposures: it refuses to run without them
  assert.equal(frozen.exposure,'day');
  await assert.rejects(run('--kinds','lner5','--views','V01','--exposure','dusk'),/--exposure dusk reuses the poses of a day pass, so poses cannot change between exposures: give --poses/);
  const [dusk]=await ok('--kinds','lner5,gn387x8','--views','V01,V08','--poses',poses,'--exposure','dusk');assert.deepEqual([dusk.exposure,dusk.posesFrozen,dusk.planned],['dusk',true,plain.planned]);
  // the lamp views at dusk: named for the exposure, posed as the day views of the frozen manifest
  const [lamps]=await ok('--kinds','lner5,gn387x8','--views','V09','--poses',poses,'--exposure','dusk');assert.deepEqual([lamps.exposure,lamps.posesFrozen,lamps.planned],['dusk',true,{lner5:{OK:2},gn387x8:{OK:2}}]);
  const [lampsDay]=await ok('--kinds','lner5','--views','V09','--poses',poses);assert.deepEqual([lampsDay.exposure,lampsDay.planned],['day',{lner5:{OK:2}}]);
  const moved=frozenManifest(['lner5']);moved.kinds.lner5.views['lights-trailing'].plan.fov=51;await writeFile(poses,JSON.stringify(moved));
  await assert.rejects(run('--kinds','lner5','--views','V09','--poses',poses,'--exposure','dusk'),/refusing to capture: 1 pose\(s\) differ from .*lner5\/lights-trailing-dusk pose differs from the frozen pose at \/fov/);
  await writeFile(poses,JSON.stringify(frozenManifest(['lner5','gn387x8'])));
  const tampered=frozenManifest(['lner5']);tampered.kinds.lner5.views['front-3m'].plan.eye[2]=-3.001;tampered.kinds.lner5.views['roof-plan'].plan.fov=51;await writeFile(poses,JSON.stringify(tampered));
  await assert.rejects(run('--kinds','lner5','--views','V02,V06','--poses',poses),/refusing to capture: 2 pose\(s\) differ from .*lner5\/front-3m pose differs from the frozen pose at \/eye\/2; lner5\/roof-plan pose differs from the frozen pose at \/fov/);
  await assert.rejects(run('--kinds','lner5,hull5','--views','V01','--poses',poses),/refusing to capture.*hull5\/\* kind missing/);
  await assert.rejects(C.catalogueMain(['--mode','catalogue','--dist',dist,'--out',path.join(dir,'..','..','elsewhere'),'--chrome','none']),/--out must be under worktree \.scratch/);
  await assert.rejects(C.catalogueMain(['--mode','catalogue','--dist',dist,'--out',scratch,'--chrome','none']),/--out must be under worktree \.scratch/);
 } finally {console.log=log;await rm(dir,{recursive:true,force:true});}
});

// ---- identity of the machine, the code and the page ---------------------------------------------------------------------------------------
test('host info reads the machine and git state through the runner it is given, and survives a command that fails',()=>{
 const seen=[],run=(command,args)=>{seen.push([command,...args].join(' '));
  if(command==='sysctl')return 'Mac99,1\n';if(args[0]==='rev-parse')return 'abc123\n';if(args[0]==='status')return ' M a.txt\n?? b.txt\n';throw new Error('unexpected');};
 const h=C.hostInfo(run,'/somewhere');
 assert.deepEqual(seen.sort(),['git rev-parse HEAD','git status --porcelain','sysctl -n hw.model']);assert.equal(h.macModel,'Mac99,1');assert.equal(h.git.head,'abc123');assert.equal(h.git.dirty,true);
 assert.deepEqual(h.git.dirtyPaths,[' M a.txt','?? b.txt'],'the status columns keep their leading space');assert.ok(['darwin','linux','win32'].includes(h.os.platform));assert.ok(h.os.release.length>0&&h.os.arch.length>0);
 const clean=C.hostInfo((command,args)=>args[0]==='status'?'':'x\n');assert.equal(clean.git.dirty,false);assert.deepEqual(clean.git.dirtyPaths,[]);
 const many=C.hostInfo((command,args)=>args[0]==='status'?Array.from({length:30},(_,i)=>` M f${i}`).join('\n'):'x');assert.equal(many.git.dirtyPaths.length,20);
 const broken=C.hostInfo(()=>{throw new Error('no git');});assert.deepEqual([broken.macModel,broken.git.head,broken.git.dirty,broken.git.dirtyPaths],[null,null,null,null]);
});

test('the build hash names the page and its main module by content',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await realpath(await mkdtemp(scratch+'/train-views-test-'));
 try {
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),index='<html><script type="module" crossorigin src="./assets/index-ABC.js"></script></html>';
  await mkdir(path.join(dir,'assets'));await writeFile(path.join(dir,'index.html'),index);await writeFile(path.join(dir,'assets','index-ABC.js'),'export default 1;');
  assert.deepEqual(await C.buildHash(dir),{indexSha256:sha(index),mainAsset:'index-ABC.js',mainAssetSha256:sha('export default 1;')});
  await writeFile(path.join(dir,'index.html'),'<html></html>');await assert.rejects(C.buildHash(dir),/loads no module script/);
  await writeFile(path.join(dir,'index.html'),'<script type="module" src="../../outside.js"></script>');await assert.rejects(C.buildHash(dir),/escapes dist/);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('a formation description gives every car its door positions in train metres and every dimension its published basis',()=>{
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),layout=trainLayout(kind),body=bodySpec(layout.spec.family);
  assert.equal(f.length,layout.length);assert.equal(f.half,body.half);assert.equal(f.roofTop,body.crown+body.coverHeight);assert.equal(f.cars.length,layout.cars.length);
  for(const car of f.cars) {
   assert.ok(car.doors.length>=2,`${kind} car ${car.index} doors`);assert.ok(car.doors.every(z=>z>car.start&&z<car.end),`${kind} car ${car.index} doors lie inside the car`);
   assert.equal(car.bogies.length,2);assert.equal(car.motor.length,2);assert.equal(car.pantograph===null,!layout.cars[car.index].pantograph);
  }
  const d=f.dimensions;
  assert.equal(d.lengthM.value,layout.length);near(d.widthM.value,2*body.half,1e-12);near(d.roofTopM.value,body.crown+body.coverHeight,1e-12);
  for(const [name,entry] of Object.entries(d)) {assert.ok(/^[a-z+]+$/.test(entry.basis),`${kind} ${name} basis ${entry.basis}`);assert.ok(entry.figures.length>0&&entry.figures.every(s=>/^(FIGURES|EMU_FIGURES\.\w+)\.\w+$/.test(s)),`${kind} ${name}`);}
  near(d.widthM.figureM,2*body.half,.06,'the modelled body width is the published width');near(d.roofTopM.figureM,d.roofTopM.value,.06,'the modelled roof is the published height');
 }
 // a cab car's doors count from the cab end; the rear cab car counts back from its own end
 const f=formations.get('lner5'),head=f.cars[0],tail=f.cars.at(-1);
 near(head.doors[0]-head.start,8,1e-9,'first door of the leading cab car is 8 m from its nose');near(tail.end-tail.doors[0],8,1e-9,'first door of the rear cab car is 8 m from its tail');
 assert.ok(head.doors[0]<head.doors[1]&&tail.doors[0]>tail.doors[1],'doors are listed from the cab end');
 near(f.cars[1].doors[0]-f.cars[1].start,3,1e-9,'an intermediate car counts from its start');
});

test('a manifest entry freezes the pose and records the outcome, and a sidecar carries the pose, the specimen turn and the measured costs',()=>{
 const v=view('lner5','front-3m'),ok=C.manifestEntry({view:v,status:'OK',reason:null,file:'lner5-front-3m.png',inspection:{checkedSamples:30,visibleFraction:1},verdict:{ok:true,changedPixels:5}});
 assert.deepEqual(ok.plan,F.poseOf(v));assert.deepEqual(ok.rotation,v.rotation);assert.deepEqual([ok.id,ok.suffix],['V02','front-3m']);
 assert.deepEqual(ok.outcome,{status:'OK',reason:null,file:'lner5-front-3m.png',blocker:null,checkedSamples:30,visibleFraction:1,pixels:{ok:true,changedPixels:5}});
 const gap=C.manifestEntry({view:v,status:'GAP',reason:'coach occluded',blocker:'Scene/screen',inspection:{clear:false,reason:'coach occluded'}});
 assert.deepEqual(gap.outcome,{status:'GAP',reason:'coach occluded',file:null,blocker:'Scene/screen',inspection:{clear:false,reason:'coach occluded'}});
 const na=C.manifestEntry({view:any('lner5','unit-coupling'),status:'N/A',reason:'single unit: x'});assert.deepEqual(na.outcome,{status:'N/A',reason:'single unit: x',file:null,blocker:null});
 const lamps=C.manifestEntry({view:view('lner5','lights-leading'),status:'GAP',reason:'no lamp switch',functional:true});assert.equal(lamps.capability?.function,'setTrainLampState');
 // CHANGED (lamp state objects): the entry names the state objects; the reason a missing page function is reported with stays on the GAP that says so and is not on a picture
 assert.deepEqual(lamps.capability.state,{front:'head',rear:'tail'});assert.match(lamps.capability.reason,/no window\.__kx\.setTrainLampState\(group, \{ front, rear \}\)/);
 const lit=C.manifestEntry({view:view('lner5','lights-trailing'),status:'OK',inspection:{checkedSamples:30,visibleFraction:1},verdict:{ok:true},file:'lner5-lights-trailing.png'});
 assert.deepEqual(lit.capability,{function:'setTrainLampState',state:{front:'tail',rear:'head'}},'no reason on a picture the page could take');
 const twin=C.manifestEntry({view:F.viewForExposure(view('lner5','lights-trailing'),'dusk'),status:'OK',inspection:{checkedSamples:30,visibleFraction:1},verdict:{ok:true},file:'lner5-lights-trailing-dusk.png'});
 assert.deepEqual([twin.suffix,twin.poseFrom,'poseFrom' in lit],['lights-trailing-dusk','lights-trailing',false]);assert.deepEqual(twin.plan,lit.plan,'the dusk view stands where the day view does');
 const session={renderer:'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)',size:[1600,1000],devicePixelRatio:1,toneMapping:0,toneMappingExposure:1,outputColorSpace:'srgb',background:'35465e',fog:null,lights:[{type:'DirectionalLight'}]};
 const live={pose:{position:[1,2,3],target:[4,5,6],fov:50,aspect:1.6,near:.03,far:9000,up:[0,1,0],positionErrorM:0},placement:{position:[0,0,0],rotationY:1.25},inspection:{clear:true},labelText:'label',costs:{triangles:11,drawCalls:12},info:{calls:13,triangles:14}};
 const sidecar=C.catalogueSidecar({kind:'lner5',view:v,file:'lner5-front-3m.png',formation:formations.get('lner5'),session,host:{os:{platform:'darwin'},macModel:'Mac17,6',git:{head:'abc'}},build:{indexSha256:'x'},
  state:{hidden:[{name:'shed',type:'Group'}],hiddenDom:['h1'],stage:{railHeadTopY:0}},result:{verdict:{ok:true},live},timings:{inspect:1}});
 assert.deepEqual([sidecar.rubric,sidecar.schema,sidecar.kind,sidecar.file],[F.CATALOGUE.rubric,'kx-catalogue-sidecar/1','lner5','lner5-front-3m.png']);
 assert.deepEqual(sidecar.view,{id:'V02',suffix:'front-3m',frame:'front',notes:v.notes,car:v.car??null,capability:null});assert.equal(sidecar.renderer,session.renderer);assert.equal(sidecar.macModel,'Mac17,6');assert.deepEqual(sidecar.host,{platform:'darwin'});
 assert.deepEqual(sidecar.viewport,{width:1600,height:1000,deviceScaleFactor:1,canvas:[1600,1000],devicePixelRatio:1});assert.deepEqual([sidecar.renderState.toneMapping,sidecar.renderState.background,sidecar.renderState.outputColorSpace],[0,'35465e','srgb']);
 vec(sidecar.pose.trainLocal.eye,v.eye);vec(sidecar.pose.world.position,[1,2,3]);assert.equal(sidecar.pose.world.positionErrorM,0);assert.deepEqual(sidecar.specimen,{groupWorldPosition:[0,0,0],rotationY:1.25,rotationRule:v.rotation});
 assert.deepEqual(sidecar.costs,{trainStatic:{triangles:11,drawCalls:12},rendererInfo:{calls:13,triangles:14}});assert.equal(sidecar.label,'label');assert.deepEqual(sidecar.hiddenSceneNames,[{name:'shed',type:'Group'}]);assert.deepEqual(sidecar.hiddenDom,['h1']);
 assert.deepEqual(sidecar.visibility,{clear:true});assert.deepEqual(sidecar.pixels,{ok:true});assert.equal(sidecar.formation.cars.length,5);assert.equal(sidecar.formation.lengthM,formations.get('lner5').length);assert.deepEqual(sidecar.dimensions,formations.get('lner5').dimensions);
 assert.equal(JSON.stringify(sidecar.formation.cars[0]).includes('doors'),false,'the sidecar lists the layout, not the door helper');
 // the classes the kind stands for, and the note where the model does not tell two classes apart
 assert.equal(sidecar.formation.classes,'800/2, 801/1');assert.equal(sidecar.formation.classNote,LNER_NOTE);
 const thameslink=C.catalogueSidecar({kind:'tl700x8',view:view('tl700x8','front-3m'),file:'tl700x8-front-3m.png',formation:formations.get('tl700x8'),session,host:{os:{platform:'darwin'},macModel:'Mac17,6',git:{head:'abc'}},build:{indexSha256:'x'},
  state:{hidden:[],hiddenDom:[],stage:{railHeadTopY:0}},result:{verdict:{ok:true},live},timings:{inspect:1}});
 assert.equal(thameslink.formation.classes,'700/0');assert.equal(thameslink.formation.classNote,null,'a kind that is one class has no note');assert.equal(thameslink.formation.kind,'tl700x8');
 // the exposure, the page's atmosphere, the lamp level of the trains and the lamp API are in the render state; what was hidden, and what was still drawn, is in `chrome`
 assert.deepEqual(sidecar.renderState,{toneMapping:0,toneMappingExposure:1,outputColorSpace:'srgb',background:'35465e',fog:null,lights:session.lights,exposure:'day',urlQuery:C.catalogueUrlQuery('day'),rig:'fixed',pinnedTime:null,pinnedWeather:null,
  atmosphere:null,trainNight:0,trainNightSource:C.trainNightOf(C.exposureRecord('day'),null).trainNightSource,lampApi:false,lampState:null});
 const atmosphere={timeMs:Date.parse('2026-11-09T16:30:00Z'),iso:'2026-11-09T16:30:00.000Z',sun:{elevationDeg:-3.2,azimuthDeg:215},weather:{label:'clear sky',visibilityM:null},rig:{daylight:.1,lampLevel:.8}};
 const chrome={hidden:[{name:'h1',drawn:true,box:[1380,12,200,30]},{name:'nav.station-switcher',drawn:true,box:[120,8,700,34]}],visible:[]};
 const dusk=C.catalogueSidecar({kind:'lner5',view:v,file:'lner5-front-3m.png',formation:formations.get('lner5'),session:{...session,lampApi:true},host:{os:{platform:'darwin'},macModel:'Mac17,6',git:{head:'abc'}},build:{indexSha256:'x'},
  state:{hidden:[],hiddenDom:['h1','nav.station-switcher'],stage:{railHeadTopY:0}},result:{verdict:{ok:true},live:{...live,atmosphere,chrome}},timings:{inspect:1},exposure:C.exposureRecord('dusk')});
 assert.deepEqual([dusk.renderState.exposure,dusk.renderState.urlQuery,dusk.renderState.rig,dusk.renderState.pinnedTime,dusk.renderState.pinnedWeather],['dusk',C.catalogueUrlQuery('dusk'),'atmosphere','2026-11-09T16:30:00Z','clear']);
 assert.deepEqual(dusk.renderState.atmosphere,atmosphere);assert.equal(dusk.renderState.trainNight,.8);assert.match(dusk.renderState.trainNightSource,/rig\.lampLevel/);assert.equal(dusk.renderState.lampApi,true);
 assert.deepEqual(dusk.chrome,chrome);assert.deepEqual(dusk.hiddenDom,['h1','nav.station-switcher']);assert.equal(sidecar.chrome,null,'a sidecar of a page that reported no chrome record says so');
 assert.deepEqual(C.trainNightOf({rig:'atmosphere'},null),{trainNight:null,trainNightSource:'unavailable: the page gave no atmosphere state'});
 // a lamp view: the state the page was given, the lamp level it drew with (read in the page, which beats the worked-out one, and a zero is a reading), and where its pose comes from
 const trailing=F.viewForExposure(view('lner5','lights-trailing'),'dusk');
 const lamp=C.catalogueSidecar({kind:'lner5',view:trailing,file:'lner5-lights-trailing-dusk.png',formation:formations.get('lner5'),session:{...session,lampApi:true},host:{os:{platform:'darwin'},macModel:'Mac17,6',git:{head:'abc'}},build:{indexSha256:'x'},
  state:{hidden:[],hiddenDom:[],stage:{railHeadTopY:0}},result:{verdict:{ok:true},live:{...live,atmosphere,lampState:{front:'tail',rear:'head'},trainNight:.55}},timings:{inspect:1},exposure:C.exposureRecord('dusk')});
 assert.deepEqual(lamp.renderState.lampState,{front:'tail',rear:'head'});assert.equal(lamp.renderState.trainNight,.55,'the value the page drew with, not the atmosphere lamp level .8');assert.match(lamp.renderState.trainNightSource,/^read from the page/);assert.equal(lamp.renderState.lampApi,true);
 assert.deepEqual([lamp.renderState.exposure,lamp.renderState.rig],['dusk','atmosphere']);assert.ok(!/bare=1/.test(lamp.renderState.urlQuery),'the dusk lamp picture is taken on the page as built, not on the bare one');
 assert.deepEqual(lamp.view,{id:'V09',suffix:'lights-trailing-dusk',frame:'front',notes:trailing.notes,car:null,capability:{function:'setTrainLampState',state:{front:'tail',rear:'head'}},poseFrom:'lights-trailing'},'the sidecar names the state, not the reason a missing function is reported with');
 assert.equal(C.trainNightOf({rig:'fixed'},null,0).trainNight,0);assert.match(C.trainNightOf({rig:'fixed'},null,0).trainNightSource,/^read from the page/,'a zero read from the page is a reading, not an absence');
 assert.equal(C.trainNightOf({rig:'atmosphere'},atmosphere,.3).trainNight,.3);assert.equal(C.trainNightOf({rig:'atmosphere'},atmosphere,null).trainNight,.8,'without a reading, the lamp level of the atmosphere');
});

// ---- the in-page driver, against a stand-in for the page ---------------------------------------------------------------------------------------
// A stand-in for the page's DOM: a tree of elements with an inline style and a box that exists unless the element or one above it is `display: none`.
// `display` is what the page's stylesheet says; the inline style wins over it, as the driver's `display: none` does, unless the element is `stubborn`
// (a stylesheet rule no inline style can override).
class FakeStyle {
 constructor() {this.map=new Map();}
 setProperty(name,value,priority='') {this.map.set(name,[String(value),priority]);}
 getPropertyValue(name) {return this.map.get(name)?.[0]??'';}
 getPropertyPriority(name) {return this.map.get(name)?.[1]??'';}
 removeProperty(name) {this.map.delete(name);}
 get display() {return this.getPropertyValue('display');}
 set display(value) {if(value==='')this.removeProperty('display');else this.setProperty('display',value);}
 set cssText(value) {this.text=value;}
}
class FakeEl {
 constructor(tagName,{id='',className='',display='block',rect=[0,0,200,24],stubborn=false}={}) {Object.assign(this,{tagName,id,className,display,rect,stubborn,parent:null,children:[],style:new FakeStyle(),textContent:'',visibility:'visible',opacity:'1'});}
 append(...kids) {for(const kid of kids){kid.parent=this;this.children.push(kid);}return this;}
 remove() {if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 contains(other) {for(let p=other;p;p=p.parent)if(p===this)return true;return false;}
 get shown() {for(let p=this;p;p=p.parent)if(!p.stubborn&&(p.style.getPropertyValue('display')||p.display)==='none')return false;return true;}
 getClientRects() {if(!this.shown)return [];const [x,y,width,height]=this.rect;return [{x,y,width,height,left:x,top:y,right:x+width,bottom:y+height}];}
 getBoundingClientRect() {const [x,y,width,height]=this.shown?this.rect:[0,0,0,0];return {x,y,width,height,left:x,top:y,right:x+width,bottom:y+height};}
}
const nameOfEl=el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className?'.'+el.className.split(' ').join('.'):'');
function fakePage() {
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1.6,.5,9000),controls={target:new T.Vector3(),update(){}},frames=[],sun=new T.DirectionalLight(0xffe8c2,1.7),hemi=new T.HemisphereLight();
 sun.position.set(-320,520,260);
 const shed=Object.assign(new T.Group(),{name:'train-shed'}),terrain=Object.assign(new T.Group(),{name:'terrain'}),sky=new T.Mesh(new T.PlaneGeometry(10,10),new T.MeshBasicMaterial());
 scene.add(hemi,sun,shed,terrain,sky);
 // the page's DOM: index.html's own chrome (title chip, fallback, status and credit lines) and what the multi-station page adds around the canvas host
 // (the Almanac button, the station tabs with their notice and placeholder, a board tooltip, the live-train label layer)
 const body=new FakeEl('BODY'),app=new FakeEl('DIV',{id:'app',rect:[0,0,1600,1000]}),canvas=new FakeEl('CANVAS',{rect:[0,0,1600,1000]});app.append(canvas);
 const h1=new FakeEl('H1',{rect:[1380,12,200,30]}),fallback=new FakeEl('DIV',{id:'fallback',display:'none'}),hud=new FakeEl('DIV',{className:'hud',display:'flex',rect:[16,960,1568,28]});
 hud.append(new FakeEl('SPAN',{id:'status',rect:[16,960,900,24]}),new FakeEl('SPAN',{rect:[920,960,660,24]}));
 const almanac=new FakeEl('DIV',{id:'almanac-back-host',rect:[0,0,109,41]}),switcher=new FakeEl('NAV',{className:'station-switcher',rect:[120,8,700,34]}),notice=new FakeEl('P',{className:'station-notice',rect:[120,44,700,20]});
 switcher.append(new FakeEl('STYLE',{display:'none'}),new FakeEl('DIV',{className:'station-buttons',rect:[120,8,500,34]}).append(...['King\u2019s Cross','St Pancras','Edinburgh Waverley'].map(()=>new FakeEl('BUTTON',{rect:[120,8,160,34]}))),notice);
 const placeholder=new FakeEl('SECTION',{className:'station-placeholder',display:'none'}),tip=new FakeEl('DIV',{className:'kx-tip',display:'none'}),labels=new FakeEl('DIV',{className:'mml-train-labels',rect:[0,0,0,0]});
 body.append(app,h1,fallback,hud,almanac,switcher,placeholder,tip,labels);
 const initial=new Set(body.children),outside=[];
 // what a frame would show besides the canvas and the capture label, worked out here from the tree and the boxes, not by the code under test
 const drawnOutside=()=>{const out=[],walk=el=>{for(const c of el.children){const kept=c===canvas||c.id==='capture-train-label';
   if(!kept&&!c.contains(canvas)&&c.shown&&c.rect[2]*c.rect[3]>0)out.push(nameOfEl(c));if(!kept)walk(c);}};walk(body);return out;};
 const find=(el,id)=>{for(const c of el.children){if(c.id===id)return c;const f=find(c,id);if(f)return f;}return null;};
 const document={body,getElementById:id=>find(body,id),createElement:tag=>new FakeEl(tag.toUpperCase())};
 // the livery paints on a canvas only where there is a document; the stand-in page has none that can, so the train is built as it is in the other tests
 const build=kind=>{const saved=globalThis.document;delete globalThis.document;try{return buildTrain(kind);}finally{globalThis.document=saved;}};
 const k={scene,camera,controls,renderer:{info:{render:{calls:7,triangles:1234}},domElement:canvas},evidenceBuildTrain:build,atmosphere:null};
 const window={__kx:k,__cat:{T,F},__signalFrame:t=>{frames.push(t);outside.push(drawnOutside());},innerWidth:1600,innerHeight:1000,
  getComputedStyle:el=>({visibility:el.visibility,opacity:el.opacity,display:el.shown?el.display:'none'})};
 return {k,window,document,frames,outside,drawnOutside,body,app,canvas,h1,hud,fallback,almanac,switcher,notice,placeholder,tip,labels,
  chromeNames:['h1','div#fallback','div.hud','div#almanac-back-host','nav.station-switcher','section.station-placeholder','div.kx-tip','div.mml-train-labels'],
  get made() {return new Map(body.children.filter(c=>!initial.has(c)&&c.id).map(c=>[c.id,c]));},shed,terrain,sky,sun,hemi,scene,camera};
}
function withPage(page,work) {
 Object.assign(globalThis,{window:page.window,document:page.document});
 try { C.catalogueDriver(); return work(page.window.__cat); } finally { delete globalThis.window; delete globalThis.document; }
}

test('the in-page driver puts the specimen on the neutral stage, hides what the stage excludes, and puts everything back',()=>{
 const page=fakePage(),before=page.scene.children.slice(),length=formations.get('lner5').length;
 withPage(page,cat=>{
  const begun=cat.begin('lner5',length);
  // CHANGED (page chrome): the DOM hidden is all of the page's chrome, not the two elements `h1` and `.hud` (the multi-station page added tabs, a notice, a button...)
  assert.deepEqual(begun.hidden,[{name:'train-shed',type:'Group'},{name:'terrain',type:'Group'},{name:'',type:'Mesh'}]);assert.deepEqual(begun.hiddenDom,page.chromeNames);
  assert.equal(page.h1.style.display,'none');assert.equal(page.hud.style.display,'none');assert.equal(begun.stage.railHeadTopY,0);
  assert.deepEqual(page.scene.children.map(o=>[o.name||o.type,o.visible]),[['HemisphereLight',true],['DirectionalLight',true],['train-shed',false],['terrain',false],['Mesh',false],['capture-stage',true],['train-lner5',true]]);
  assert.throws(()=>cat.begin('lner5',length),/already on stage/);
  const v=view('lner5','nose-34-left'),text='lner5 catalogue specimen on neutral stage - V01 nose-34-left',r=cat.view(v,text);
  assert.equal(r.inspection.clear,true,JSON.stringify(r.inspection).slice(0,200));near(r.pose.positionErrorM,0,1e-9);assert.equal(r.labelText,text);assert.equal(page.made.get('capture-train-label').textContent,text);
  assert.deepEqual(r.info,{calls:7,triangles:1234});near(r.placement.rotationY,v.rotation.rotationY,1e-12);assert.equal(page.frames.length,1,'one frame is drawn per view');
  const stage=page.scene.getObjectByName('capture-stage');near(stage.rotation.y,v.rotation.rotationY,1e-12);assert.deepEqual(r.costs,F.trainCosts(page.scene.getObjectByName('train-lner5')));
  assert.equal(page.camera.fov,50);vec(page.k.controls.target.toArray(),r.pose.target,1e-12);
  // a second view re-labels the one label and turns the specimen again
  cat.view(view('lner5','roof-plan'),'second');assert.equal(page.made.size,1);assert.equal(page.made.get('capture-train-label').textContent,'second');vec(page.camera.up.toArray().map(n=>Math.round(n*1e6)/1e6),[Math.round(Math.cos(stage.rotation.y)*1e6)/1e6,0,-Math.round(Math.sin(stage.rotation.y)*1e6)/1e6],1e-5);
  // the specimen can be hidden for the empty-stage baseline, cut to one car, and restored with every part as it was
  const group=page.scene.getObjectByName('train-lner5'),was=group.children.map(o=>o.visible);
  cat.isolate('empty');assert.equal(group.visible,false);cat.isolate('car:1');assert.equal(group.visible,true);assert.deepEqual(group.children.filter(o=>o.visible).map(o=>o.name),['car-1']);
  cat.isolate('all');assert.equal(group.visible,true);assert.deepEqual(group.children.map(o=>o.visible),was);assert.equal(page.frames.length,2+3);
  assert.equal(cat.end(),true);
  // CHANGED (page chrome): the stylesheet gives `.hud` its flex, so with the inline style gone the display is the stylesheet's (the old stand-in kept the flex inline)
  assert.deepEqual(page.scene.children,before);assert.ok(page.scene.children.every(o=>o.visible));assert.equal(page.h1.style.display,'');assert.equal(page.hud.style.display,'');assert.equal(page.hud.shown,true);vec(page.camera.up.toArray(),[0,1,0],1e-12);
  assert.equal(page.made.size,0,'the label comes off the page');
  assert.equal(cat.state,null);assert.equal(cat.end(),false);
  cat.begin('hull5',formations.get('hull5').length);assert.equal(page.scene.children.at(-1).name,'train-hull5');cat.end();
 });
});

test('the in-page driver stops at a page that moves the camera, and at a lamp view when the page has no lamp switch',()=>{
 const page=fakePage(),v=view('lner5','front-3m'),lamp=view('lner5','lights-leading'),other=view('lner5','lights-trailing');
 withPage(page,cat=>{
  cat.begin('lner5',formations.get('lner5').length);
  assert.throws(()=>cat.view(lamp,'x'),/page lost setTrainLampState/);
  // CHANGED (lamp state objects): the page is given the state object (a copy: it cannot edit the plan), and the frame reports the state it was given; it was the word leading
  const states=[];page.k.setTrainLampState=(group,state)=>states.push([group.name,state]);
  const first=cat.view(lamp,'x');assert.deepEqual(states,[['train-lner5',{front:'head',rear:'tail'}]]);assert.deepEqual(first.lampState,{front:'head',rear:'tail'});assert.notEqual(states[0][1],lamp.capability.state,'the page gets a copy');
  const second=cat.view(other,'x');assert.deepEqual(states.at(-1),['train-lner5',{front:'tail',rear:'head'}]);assert.deepEqual(second.lampState,{front:'tail',rear:'head'});
  // a page that edits the state it is given changes neither the plan nor what the frame reports
  page.k.setTrainLampState=(group,state)=>{state.front='off';};const third=cat.view(lamp,'x');assert.deepEqual(third.lampState,{front:'head',rear:'tail'});assert.deepEqual(lamp.capability.state,{front:'head',rear:'tail'});
  // a view that is not a lamp view does not touch the lamps and reports no state
  const calls=states.length;page.k.setTrainLampState=(group,state)=>states.push([group.name,state]);const plain=cat.view(v,'x');assert.equal(states.length,calls);assert.equal(plain.lampState,null);
  page.window.__signalFrame=()=>{page.camera.position.x+=.5;};assert.throws(()=>cat.view(v,'x'),/moved the camera by 0\.5 m/);
 });
});

test('a frame reports the lamp level the page draws the trains with, read from the train material, and null where no material takes it',()=>{
 const page=fakePage();
 withPage(page,cat=>{
  cat.begin('lner5',formations.get('lner5').length);
  try {for(const level of [0,.375,1]){trainNight.value=level;assert.equal(cat.view(view('lner5','front-3m'),'x').trainNight,level,`the page's value ${level}`);}}
  finally {trainNight.value=0;}
  // a train whose materials take no night uniform has no reading, and the hook that asks the material is harmless to it
  const group=page.scene.children.at(-1),saved=[];group.traverse(o=>{if(o.isMesh){saved.push([o,o.material]);o.material=new T.MeshBasicMaterial();}});
  assert.equal(cat.view(view('lner5','front-3m'),'x').trainNight,null);for(const [o,m] of saved)o.material=m;
  // a material whose hook throws is skipped, and the next one is asked
  const odd=new T.MeshBasicMaterial();odd.onBeforeCompile=()=>{throw new Error('no');};const first=saved[0][0];first.material=odd;
  try {trainNight.value=.5;let frame;assert.doesNotThrow(()=>{frame=cat.view(view('lner5','front-3m'),'x');},'a hook that throws is skipped');assert.equal(frame.trainNight,.5);} finally {trainNight.value=0;first.material=saved[0][1];}
  cat.end();
 });
});

test('the page chrome is every element of the body off the way to the canvas, found by structure, and it is hidden inline and put back exactly',()=>{
 const page=fakePage(),doc=page.document,win=page.window,options={canvas:page.canvas,keepIds:['capture-train-label']};
 assert.equal(F.domName(page.h1),'h1');assert.equal(F.domName(page.hud),'div.hud');assert.equal(F.domName(page.almanac),'div#almanac-back-host');assert.equal(F.domName(new FakeEl('DIV',{id:'a',className:'b  c'})),'div#a.b.c');
 const svg={tagName:'svg',id:'',className:{baseVal:'x'}};assert.doesNotThrow(()=>F.domName(svg),'an SVG className is not a string');assert.equal(F.domName(svg),'svg');
 // which elements are chrome: the children of the body, except the canvas host (which holds the canvas and is walked into) and the things that draw nothing
 page.body.append(new FakeEl('SCRIPT',{rect:[0,0,10,10]}),new FakeEl('STYLE',{rect:[0,0,10,10]}),new FakeEl('NOSCRIPT',{rect:[0,0,10,10]}),new FakeEl('TEMPLATE',{rect:[0,0,10,10]}),new FakeEl('LINK',{rect:[0,0,10,10]}),new FakeEl('META',{rect:[0,0,10,10]}));
 assert.deepEqual(F.pageChrome(doc,options).map(F.domName),page.chromeNames,'script, style, link, meta, template and noscript are not chrome');
 const stray=new FakeEl('DIV',{className:'stray',rect:[5,5,20,20]});page.app.append(stray);
 assert.deepEqual(F.pageChrome(doc,options).map(F.domName),['div.stray',...page.chromeNames],'a sibling of the canvas inside its host is chrome, the host and the canvas are not');
 assert.deepEqual(F.visibleChrome(doc,win,options).map(v=>v.name),['div.stray','h1','div.hud','div#almanac-back-host','nav.station-switcher'],'and a drawn one is seen from the host as well as from the body');
 stray.remove();
 const fractional=new FakeEl('DIV',{className:'fractional',rect:[-0.04,20.06,30.123,40.987]});page.body.append(fractional);
 assert.deepEqual(F.visibleChrome(doc,win,options).find(v=>v.name==='div.fractional').box,[0,20.1,30.1,41],'boxes are in tenths of a pixel, and a hair below zero is zero, not minus zero');fractional.remove();
 const wrapper=new FakeEl('DIV',{className:'wrapper'}),kept=new FakeEl('DIV',{id:'keep-me'}),beside=new FakeEl('DIV',{className:'beside'});wrapper.append(kept,beside);page.body.append(wrapper);
 assert.deepEqual(F.pageChrome(doc,{canvas:page.canvas,keepIds:['keep-me','missing']}).map(F.domName),[...page.chromeNames,'div.beside'],'whatever holds a kept element is walked into, not hidden; an id that is not there keeps nothing');
 wrapper.remove();
 // drawn: a box with area that meets the viewport, not hidden and not transparent
 const probe=patch=>Object.assign(new FakeEl('DIV',{rect:[100,100,50,50]}),patch);
 assert.equal(F.isDrawn(probe({}),win),true);assert.equal(F.isDrawn(probe({visibility:'hidden'}),win),false);assert.equal(F.isDrawn(probe({opacity:'0'}),win),false);assert.equal(F.isDrawn(probe({opacity:'0.5'}),win),true);
 assert.equal(F.isDrawn(probe({rect:[100,100,0,50]}),win),false,'no width');assert.equal(F.isDrawn(probe({rect:[100,100,50,0]}),win),false,'no height');assert.equal(F.isDrawn(probe({display:'none'}),win),false);
 assert.equal(F.isDrawn(probe({rect:[1599,100,50,50]}),win),true,'one pixel inside the right edge');assert.equal(F.isDrawn(probe({rect:[1600,100,50,50]}),win),false,'off the right edge');assert.equal(F.isDrawn(probe({rect:[100,999,50,50]}),win),true);assert.equal(F.isDrawn(probe({rect:[100,1000,50,50]}),win),false,'below the bottom');
 assert.equal(F.isDrawn(probe({rect:[-49,100,50,50]}),win),true);assert.equal(F.isDrawn(probe({rect:[-50,100,50,50]}),win),false,'off the left edge');assert.equal(F.isDrawn(probe({rect:[100,-50,50,50]}),win),false,'above the top');
 // hiding: inline and important, whether drawn now or not; each record says what it was and where; a second sweep adds only what is new
 const hidden=F.hideChrome(doc,win,options);
 assert.deepEqual(hidden.map(h=>h.name),page.chromeNames);assert.deepEqual(hidden.map(h=>h.drawn),[true,false,true,true,true,false,false,false],'drawn: the title, hud, Almanac button and tabs; not the fallback, the placeholder, the tooltip or the empty label layer');
 assert.deepEqual(hidden[0].box,[1380,12,200,30]);assert.equal(hidden[1].box,null,'an element that was not drawn has no box to report');
 assert.ok(hidden.every(h=>h.el.style.getPropertyValue('display')==='none'&&h.el.style.getPropertyPriority('display')==='important'),'inline and important, so no stylesheet rule brings it back');
 assert.deepEqual(F.visibleChrome(doc,win,options),[]);const swept=hidden.length;assert.equal(F.hideChrome(doc,win,{...options,hidden}),hidden,'it returns the list it was given');assert.equal(hidden.length,swept,'a second sweep finds nothing new');
 page.body.append(new FakeEl('DIV',{className:'toast',rect:[600,500,300,40]}));assert.deepEqual(F.visibleChrome(doc,win,options),[{name:'div.toast',box:[600,500,300,40]}]);
 assert.equal(F.hideChrome(doc,win,{...options,hidden}).length,page.chromeNames.length+1);assert.deepEqual(F.visibleChrome(doc,win,options),[]);
 // the canvas, its host and the label are never hidden
 assert.ok([page.canvas,page.app].every(e=>e.shown));
 // putting back: the inline display (and its priority) each element had, or none
 F.restoreChrome(hidden);assert.equal(hidden.length,0);assert.ok(page.h1.shown&&page.hud.shown&&page.switcher.shown&&page.almanac.shown);assert.equal(page.h1.style.getPropertyValue('display'),'');
 page.switcher.style.setProperty('display','flex','important');page.hud.style.setProperty('display','grid');
 const again=F.hideChrome(doc,win,options);assert.deepEqual(again.find(h=>h.el===page.switcher).was,{value:'flex',priority:'important'});assert.deepEqual(again.find(h=>h.el===page.hud).was,{value:'grid',priority:''});F.restoreChrome(again);
 assert.deepEqual([page.switcher.style.getPropertyValue('display'),page.switcher.style.getPropertyPriority('display')],['flex','important'],'its priority too');assert.deepEqual([page.hud.style.getPropertyValue('display'),page.hud.style.getPropertyPriority('display')],['grid','']);
 // what is visible: a drawn element anywhere outside the canvas and the label, found even under a parent that draws nothing; the label and the canvas are not
 const layer=page.labels,span=new FakeEl('SPAN',{className:'train-label',rect:[300,300,80,16]});layer.append(span);
 assert.deepEqual(F.visibleChrome(doc,win,options).map(v=>v.name),['h1','div.hud','div#almanac-back-host','nav.station-switcher','span.train-label','div.toast'],'the empty label layer draws nothing itself, but its label does');
 const label=new FakeEl('DIV',{id:'capture-train-label',rect:[8,8,300,24]});page.body.append(label);label.append(new FakeEl('SPAN',{rect:[8,8,40,20]}));
 assert.ok(!F.visibleChrome(doc,win,options).some(v=>/capture-train-label|^span$/.test(v.name)),'the capture label and what is inside it are the picture');
});

test('a frame reports the page atmosphere as it has it: null under the fixed day rig, and an unlimited visibility as null',()=>{
 const page=fakePage(),at=Date.parse('2026-11-09T16:30:00Z');
 page.k.atmosphere={state:()=>({timeMs:at,sun:{elevationDeg:-3.2,azimuthDeg:215,apparentElevationDeg:-2.9},weather:{label:'clear sky',cloud:.25,rain:.5,snow:.125,visibilityM:Infinity,wet:.75,snowCover:.0625,windMs:2,thunder:true},
  rig:{daylight:.1,lampLevel:.8,stars:.2,fogAmount:.05,sun:{intensity:.06},moon:{intensity:.3},hemisphere:{intensity:.4},dome:{}}})};
 withPage(page,cat=>{
  cat.begin('lner5',formations.get('lner5').length);const r=cat.view(view('lner5','front-3m'),'x');
  const expected={timeMs:at,iso:'2026-11-09T16:30:00.000Z',sun:{elevationDeg:-3.2,azimuthDeg:215},weather:{label:'clear sky',cloud:.25,rain:.5,snow:.125,visibilityM:null,wet:.75,snowCover:.0625,windMs:2,thunder:true},
   rig:{daylight:.1,lampLevel:.8,stars:.2,fogAmount:.05,sunIntensity:.06,moonIntensity:.3,hemisphereIntensity:.4}};
  assert.deepEqual(r.atmosphere,expected);assert.deepEqual(cat.atmosphere(),expected);assert.deepEqual(JSON.parse(JSON.stringify(r.atmosphere)),expected,'it survives the trip back to Node');
  const was=page.k.atmosphere.state();page.k.atmosphere={state:()=>({...was,weather:{...was.weather,label:'fog',visibilityM:180}})};assert.equal(cat.view(view('lner5','front-3m'),'x').atmosphere.weather.visibilityM,180);
  page.k.atmosphere=null;assert.equal(cat.view(view('lner5','front-3m'),'x').atmosphere,null);assert.equal(cat.atmosphere(),null);
  page.k.atmosphere={state:()=>null};assert.equal(cat.atmosphere(),null,'an atmosphere that has not drawn a frame has no state');
  cat.end();
 });
});

test('every kind names the classes it stands for, and the LNER kinds say the model does not tell the Class 800 from the 801',()=>{
 assert.deepEqual([...ALL_KINDS].sort(),Object.keys(CLASSES).sort(),'every kind has an expected class label here');
 assert.deepEqual(Object.keys(C.CLASS_NOTES).sort(),['lner5','lner9'],'only the two LNER kinds carry a note');
 for(const kind of ALL_KINDS) {
  const formation=formations.get(kind),lner=kind==='lner5'||kind==='lner9';
  assert.equal(formation.classes,TRAIN_SPECS[kind].classes,`${kind}: the classes come from the train spec`);assert.equal(formation.classes,CLASSES[kind],`${kind}: the classes`);
  assert.equal(formation.classNote,lner?LNER_NOTE:null,`${kind}: ${lner?'the LNER note, word for word':'no note'}`);
  // the manifest's formation block carries both, beside what it carried before
  const block=C.manifestFormation(formation);
  assert.deepEqual(block,{family:formation.family,classes:CLASSES[kind],classNote:lner?LNER_NOTE:null,lengthM:formation.length,dimensions:formation.dimensions,cars:formation.cars},`${kind}: manifest formation`);
 }
 assert.ok(Object.isFrozen(C.CLASS_NOTES),'the table is not edited by a run');
});

test('the geometry check reports the surface points it saw so the picture can be checked against them',()=>{
 const f=checkFixture(),r=inspect(f,side(12));
 assert.equal(r.clear,true,JSON.stringify(r).slice(0,200));assert.ok(r.sampleNdc.length>=20);const seen=new Set(r.sampleNdc.map(p=>p.join()));assert.ok(seen.size>=10,'the points are spread, not one point repeated');
 const spread=Math.max(...r.sampleNdc.map(p=>p[0]))-Math.min(...r.sampleNdc.map(p=>p[0]));assert.ok(spread>.4,`spread ${spread}`);
});

test('spread samples keep at most the asked number of points, spread over the image, with its four extremes',()=>{
 const camera=new T.PerspectiveCamera(50,1.6,.1,500);camera.position.set(0,0,30);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
 const points=[];for(let i=0;i<30;i++)for(let j=0;j<30;j++)points.push(new T.Vector3(-6+i*.4,-4+j*.27,0));
 const few=points.slice(0,10);assert.equal(F.spreadSamples(T,few,camera,64),few,'a short list is returned as it is');
 const chosen=F.spreadSamples(T,points,camera,64),ndc=chosen.map(p=>p.clone().project(camera)),all=points.map(p=>p.clone().project(camera));
 assert.ok(chosen.length<=64+4&&chosen.length>=40,`${chosen.length} points`);assert.equal(new Set(chosen).size,chosen.length,'no point twice');
 for(const [axis,pick] of [['x',Math.min],['x',Math.max],['y',Math.min],['y',Math.max]])near(pick(...ndc.map(p=>p[axis])),pick(...all.map(p=>p[axis])),1e-12,`the ${axis} ${pick.name} is kept`);
 // a 7 x 7 grid is laid over the points (seven being the whole part of the square root of 60); each of its cells is represented, so no band of the image is empty
 const lo=axis=>Math.min(...all.map(q=>q[axis])),hi=axis=>Math.max(...all.map(q=>q[axis])),cell=(p,axis)=>Math.min(6,Math.floor((p[axis]-lo(axis))/(hi(axis)-lo(axis))*7));
 assert.equal(new Set(ndc.map(p=>`${cell(p,'x')}:${cell(p,'y')}`)).size,49);assert.ok(chosen.length<=53,'one point per cell and the four extremes');
 assert.deepEqual(F.spreadSamples(T,points,camera,64).map(p=>p.toArray()),chosen.map(p=>p.toArray()),'the same input gives the same points');
});

test('a camera is inside a mesh only when the surface closes round it in at least five of six directions, and the level of detail follows the camera',()=>{
 const merged=(...parts)=>{const g=new T.BufferGeometry(),pos=[],idx=[];let off=0;
  for(const part of parts){const p=part.attributes.position;for(let i=0;i<p.count;i++)pos.push(p.getX(i),p.getY(i),p.getZ(i));for(const i of part.index.array)idx.push(i+off);off+=p.count;}
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);return g;};
 // single surfaces, so a ray from inside crosses each once: a floor, two long walls, two end walls
 const floor=new T.PlaneGeometry(10,40).rotateX(-Math.PI/2),wall=x=>new T.PlaneGeometry(40,8).rotateY(Math.PI/2).translate(x,4,0),end=z=>new T.PlaneGeometry(10,8).translate(0,4,z),roof=new T.PlaneGeometry(10,40).rotateX(-Math.PI/2).translate(0,8,0);
 const mesh=(name,...parts)=>{const m=new T.Mesh(merged(...parts),new T.MeshBasicMaterial());m.name=name;m.updateMatrixWorld(true);return m;};
 // the name of the mesh the point is inside, or null (never the mesh itself: a failed assertion would print the whole geometry)
 const inside=(m,at=[0,2,0])=>F.cameraInsideMesh(T,new T.Vector3(...at),[m])?.name??null;
 assert.equal(inside(mesh('canyon',floor,wall(-5),wall(5))),null,'a floor and two walls close three of six directions');
 assert.equal(inside(mesh('yard',floor,wall(-5),wall(5),end(-20),end(20))),'yard','a floor and four walls close five');
 assert.equal(inside(mesh('room',floor,wall(-5),wall(5),end(-20),end(20),roof)),'room','a closed room closes six');
 assert.equal(inside(mesh('yard',floor,wall(-5),wall(5),end(-20),end(20)),[0,2,30]),null,'outside the yard is outside');
 // the level of detail: a camera far off asks for the coarse level
 const scene=new T.Scene(),group=new T.Group(),lod=new T.LOD(),near=new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshBasicMaterial()),far=new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshBasicMaterial());
 lod.addLevel(near,0);lod.addLevel(far,50);group.add(lod);scene.add(group);
 const camera=new T.PerspectiveCamera(50,1.6,.1,1000);camera.position.set(0,0,200);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 F.inspectCatalogueView(T,scene,camera,group,{heightAt:()=>-.2},{region:{min:[-2,-2,-2],max:[2,2,2]},fov:50});assert.equal(lod.getCurrentLevel(),1,'seen from 200 m the coarse level is the one checked');
 camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 F.inspectCatalogueView(T,scene,camera,group,{heightAt:()=>-.2},{region:{min:[-2,-2,-2],max:[2,2,2]},fov:50});assert.equal(lod.getCurrentLevel(),0);
});

test('the pose of a camera is reported against the pose that was asked for',()=>{
 const camera=new T.PerspectiveCamera(33,1.6,.2,800),controls={target:new T.Vector3(1,2,3)};camera.position.set(4,5,6);
 const pose=F.cameraPose(camera,controls,{plannedPosition:[1,1,1],plannedTarget:[1,2,3]});
 near(pose.positionErrorM,Math.hypot(3,4,5),1e-12);vec(pose.position,[4,5,6]);vec(pose.target,[1,2,3]);assert.deepEqual([pose.fov,pose.near,pose.far,pose.aspect],[33,.2,800,1.6]);assert.deepEqual(pose.plannedPosition,[1,1,1]);
 assert.equal(F.cameraPose(camera,controls).positionErrorM,0);
 const world=F.setWorldView(T,camera,{target:new T.Vector3(),update(){}},{eye:[10,2.6,-4],target:[0,1.7,0],fov:50,up:[0,1,0],near:.5});
 vec(world.position,[10,2.6,-4],1e-9);assert.equal(camera.near,.5);near(world.positionErrorM,0,1e-9);
});

test('a planned view is exactly its frozen numbers: status, frame, pose, region, extents, car and the specimen turn',()=>{
 const v=view('lner5','cab-car-side-left'),p=F.poseOf(v);
 assert.deepEqual(Object.keys(p).sort(),['car','extents','eye','fov','frame','near','region','rotationY','status','target','up']);
 assert.deepEqual([p.status,p.frame,p.fov,p.near,p.rotationY],['OK','front',25,v.near,v.rotation.rotationY]);assert.equal(p.eye,v.eye);assert.equal(p.extents,v.extents);assert.equal(p.car,v.car);assert.equal(p.region,v.region);
 // (a GAP is a train with no trailer bogie in the model: the Azuma kinds used to be one; here an Azuma with a motor under every bogie)
 const allMotor=F.planCatalogueViews({...formations.get('lner5'),cars:formations.get('lner5').cars.map(c=>({...c,motor:[true,true]}))});
 const gap=F.poseOf(allMotor.find(x=>x.suffix==='bogie-trailer'));assert.deepEqual([gap.status,gap.eye,gap.rotationY],['GAP',undefined,undefined]);
 assert.equal(F.poseDifference(p,JSON.parse(JSON.stringify(p))),null);assert.equal(F.poseDifference({a:[1,2]},{a:[1,2.00001]}),'/a/1');assert.equal(F.poseDifference({a:[1,2]},{a:[1,2.00001]},1e-3),null);assert.equal(F.poseDifference({a:[1,2]},{a:[1,2.0000001]}),null);
 assert.equal(F.poseDifference({a:1},{a:'1'}),'/a');assert.equal(F.poseDifference({a:null},{a:undefined}),'/a');assert.equal(F.poseDifference({a:[1]},{a:{0:1}}),'/a');assert.equal(F.poseDifference({a:1,b:2},{a:1}),'/b');
});

// ---- V10: the specimen at a real buffer stop, with cameras standing on the platforms ------------------------------------------------------
const station=await C.loadStationScene();
/** Runs `fn`; whatever it throws that is not already an assertion becomes one, so a broken function fails the assertion that asked for it. */
const calm=(fn,what='the call')=>{try{return fn();}catch(e){if(e instanceof assert.AssertionError)throw e;assert.fail(`${what} threw ${e?.name}: ${e?.message}`);}};
/** `calm` for an async call: whatever it throws that is not already an assertion becomes one, so a broken function fails the assertion that asked for it. */
const calmly=async(fn,what='the call')=>{try{return await fn();}catch(e){if(e instanceof assert.AssertionError)throw e;assert.fail(`${what} threw ${e?.name}: ${e?.message}`);}};
const reseat=args=>calmly(()=>C.reseatStationResults(args),'reseatStationResults');
const planOf=(kind,scene=station)=>calm(()=>F.planStation(formations.get(kind),scene),`planStation(${kind})`);
/** The station plan of a kind, made on first use (so a broken planner fails the tests that ask for a plan, not the whole file). */
const stationPlans={cache:new Map(),get(kind){if(!this.cache.has(kind))this.cache.set(kind,planOf(kind));return this.cache.get(kind);}};
const NORTH=[Math.sin(station.heading),-Math.cos(station.heading)];
const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
/** What the page's search would report for a plan: `accepts[placementId][suffix]` is the index of the accepted candidate, or null for none; every candidate before it failed. */
const fakeReport=(plan,accepts)=>plan.placements.filter(p=>accepts[p.id]).map(p=>{
 const views={};let clear=0;
 for(const v of p.views){
  const index=accepts[p.id][v.suffix]??null;
  assert.ok(index===null||v.candidates[index],`${p.id} ${v.suffix} has ${v.candidates.length} candidate cameras, so none is number ${index} to accept`);
  const tried=v.candidates.slice(0,index===null?v.candidates.length:index+1).map((c,i)=>({azimuthDeg:c.azimuthDeg,platform:c.platform,clear:i===index,reason:i===index?null:'coach occluded',blocker:i===index?null:'Scene/furniture/benches'}));
  views[v.suffix]={tested:tried.length,accepted:index===null?null:{index,azimuthDeg:v.candidates[index].azimuthDeg},tried};if(index!==null)clear++;
 }
 return {placementId:p.id,clear,views};
});
const allAt=(plan,id,index=0)=>({[id]:Object.fromEntries(plan.views.map(v=>[v.suffix,index]))});
const viewsOf=(kind,accepts)=>{const plan=stationPlans.get(kind);return F.stationViewsFromSearch(plan,fakeReport(plan,accepts(plan)));};
/** What a run's manifest holds of its views (see C.manifestEntry): the frozen numbers and the outcome. */
const manifestOf=views=>({views:Object.fromEntries(views.map(v=>[v.suffix,{plan:JSON.parse(JSON.stringify(F.poseOf(v))),outcome:{status:v.status,reason:v.reason,blocker:v.blocker??null}}]))});

test('V10 stands the specimen at the fourth buffer stop from the west, nose at the buffers first and then turned so the leading cab is at the north end',()=>{
 assert.equal(station.stops.length,9);assert.ok(station.stops.every((s,i)=>i===0||s.x>station.stops[i-1].x),'the stops run from west to east');
 assert.equal(F.CATALOGUE.stationStopIndex,3);assert.equal(F.CATALOGUE.noseToStopM,1.5);assert.deepEqual(F.STATION_ORIENTATIONS,['nose-at-buffers','cab-at-north-end']);
 const stop=station.stops[3];
 for(const kind of ALL_KINDS) {
  const plan=stationPlans.get(kind),L=formations.get(kind).length;assert.deepEqual(plan.placements.map(p=>p.id),['stop-3-nose-at-buffers','stop-3-cab-at-north-end'],kind);
  const [a,b]=plan.placements,standing=station.standing(stop);
  assert.deepEqual([a.orientation,a.stop],['nose-at-buffers',{index:3,id:stop.id,x:stop.x,z:stop.z}]);vec(a.position,[standing.nose[0],0,standing.nose[1]],1e-12,kind);near(a.rotationY,standing.rotationY,1e-12);
  vec(F.placedPoint(a,[0,0,0]),[stop.x+1.5*NORTH[0],0,stop.z+1.5*NORTH[1]],1e-9,`${kind}: the nose stands 1.5 m north of the stop`);
  const aTail=F.placedPoint(a,[0,0,L]);vec([aTail[0]-a.position[0],aTail[2]-a.position[2]],[L*NORTH[0],L*NORTH[1]],1e-9,`${kind}: the body runs north`);
  vec(F.placedPoint(b,[0,0,L]),[stop.x+1.5*NORTH[0],0,stop.z+1.5*NORTH[1]],1e-9,`${kind}: the tail stands where the nose stood, 1.5 m from the stop`);
  vec(F.placedPoint(b,[0,0,0]),aTail,1e-9,`${kind}: the nose stands where the other orientation's tail stood`);
  const back=F.placedPoint(b,[0,0,1]);vec([back[0]-b.position[0],back[2]-b.position[2]],[-NORTH[0],-NORTH[1]],1e-9,`${kind}: the body runs south`);
  near(Math.abs(wrapDeg((b.rotationY-a.rotationY)/D2R)),180,1e-9,`${kind}: half a turn apart`);assert.ok(Math.abs(b.rotationY)<=Math.PI+1e-12);
 }
 assert.throws(()=>F.stationPlacement({standing:station.standing(stop),heading:station.heading,length:100,orientation:'sideways'}),/unknown station orientation sideways/);
 // the maths is the page's: a group put there in three.js sends train-local points to the same world points
 for(const p of stationPlans.get('lner5').placements) {
  const group=new T.Group();group.position.set(...p.position);group.rotation.y=p.rotationY;group.updateMatrixWorld(true);
  for(const local of [[0,0,0],[1.3,1.7,5],[-2,.5,60],[0,3,120.5]]) vec(F.placedPoint(p,local),group.localToWorld(new T.Vector3(...local)).toArray(),1e-9,`${p.id} ${local}`);
 }
});

test('V10 looks at the leading cab and at the middle of car 1, from 25, 75 and 150 m, and judges the body above the platform edge',()=>{
 assert.deepEqual(F.STATION_VIEWS,['station-25m','station-75m','station-150m','station-25m-coach','station-75m-coach','station-150m-coach']);
 assert.deepEqual(F.STATION_VIEW_TABLE.map(r=>r[1]),[25,75,150,25,75,150]);assert.deepEqual(F.STATION_VIEW_TABLE.map(r=>r[2]),['cab','cab','cab','coach','coach','coach']);
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),specs=F.stationViewSpecs(f),c1=f.cars[1];
  assert.deepEqual(specs.map(s=>s.suffix),F.STATION_VIEWS,kind);assert.ok(specs.every(s=>s.id==='V10'));
  for(const s of specs.slice(0,3)) {vec(s.focusLocal,[0,1.7,1.5]);assert.deepEqual(s.car,{index:0,type:f.cars[0].type});near(s.region.min[2],-.2);near(s.region.max[2],12);}
  for(const s of specs.slice(3)) {vec(s.focusLocal,[0,1.7,(c1.start+c1.end)/2],1e-6,kind);assert.deepEqual(s.car,{index:1,type:c1.type});near(s.region.min[2],c1.start-.01,1e-6);near(s.region.max[2],c1.end+.01,1e-6);}
  for(const s of specs) {near(s.region.min[1],1);near(s.region.max[1],f.roofTop+.3,1e-6);near(s.region.max[0],f.half+.3,1e-6);near(s.region.min[0],-f.half-.3,1e-6);}
 }
});

test('V10 camera positions are exactly the asked distance from the focus, over a platform and clear of its edge, and are tried best first',()=>{
 const square=[[-60,-60],[60,-60],[60,60],[-60,60]],platforms=[{ref:'P',pts:square}],inside=pointInPolygon;
 near(F.polygonEdgeDistance([0,0],square),60);near(F.polygonEdgeDistance([59,0],square),1);near(F.polygonEdgeDistance([0,100],square),40,1e-9);near(F.polygonEdgeDistance([3,4],[[0,0],[0,0],[0,0]]),5,1e-12,'a degenerate edge is a point');
 near(F.polygonEdgeDistance([100,100],square),Math.hypot(40,40),1e-9,'beyond a corner, the distance is to the corner, not to the line of an edge');near(F.polygonEdgeDistance([-59,0],square),1,1e-12,'the closing edge counts');near(F.polygonEdgeDistance([0,59.5],square),.5,1e-12);
 const at=F.stationCameraAt({focusXZ:[0,0],distanceM:25,azimuthDeg:90,platforms,inside,edgeClearM:.5});vec(at.xz,[25,0],1e-9);assert.equal(at.platform,'P');
 assert.equal(F.stationCameraAt({focusXZ:[0,0],distanceM:25,azimuthDeg:90,platforms:[],inside}),null);
 assert.equal(F.stationCameraAt({focusXZ:[0,0],distanceM:59.9,azimuthDeg:90,platforms,inside,edgeClearM:.5}),null,'a tenth of a metre inside the edge is not clear of it');assert.ok(F.stationCameraAt({focusXZ:[0,0],distanceM:59.9,azimuthDeg:90,platforms,inside}),'with no clearance asked, any point inside counts');
 assert.ok(F.stationCameraAt({focusXZ:[0,0],distanceM:59.4,azimuthDeg:90,platforms,inside,edgeClearM:.5}));assert.equal(F.stationCameraAt({focusXZ:[0,0],distanceM:59.6,azimuthDeg:90,platforms,inside,edgeClearM:.5}),null);
 // facing south (rotationY 0 puts the nose toward -z, so the front bearing is 180): the best cameras are 45 degrees either side of it
 const placement={position:[0,0,0],rotationY:0},spec={suffix:'s',distanceM:25,focus:'cab',focusLocal:[0,1.7,0]};
 const cameras=args=>calm(()=>F.stationCameras(args),'stationCameras'),cams=cameras({placement,spec,platforms,inside,edgeClearM:.5});
 // CHANGED (V10 thinned-out neighbours): `candidates` used to be only the thinned list (at most 48 of the 360 positions); it is now every position over a platform,
 // the same thinned list first (`spreadCount`, at most 48) and the neighbours that thinning dropped after it. Evidence: the tests below, and the round-2 replay
 // (every accepted round-2 camera is still at the same index, with the same rejected cameras before it).
 assert.deepEqual(cams.candidates.slice(0,6).map(c=>c.azimuthDeg),[135,225,133,137,223,227]);assert.equal(cams.candidateCount,360);assert.equal(cams.spreadCount,48);assert.equal(cams.candidates.length,360);
 // bearings: 0 is +z, 90 is +x, so a platform that lies only to the -z side of the focus offers only bearings of 115 to 245 degrees at 25 m
 const south=cameras({placement,spec,platforms:[{ref:'N',pts:[[-60,-60],[60,-60],[60,-10],[-60,-10]]}],inside,edgeClearM:.5});
 assert.equal(south.candidateCount,131);assert.deepEqual(south.candidates.slice(0,2).map(c=>c.azimuthDeg),[135,225]);assert.ok(south.candidates.every(c=>c.azimuthDeg>=115&&c.azimuthDeg<=245&&c.eye[2]<=-10.5+1e-9));
 const west=cameras({placement:{position:[0,0,0],rotationY:Math.PI/2},spec,platforms:[{ref:'W',pts:[[-60,-60],[-10,-60],[-10,60],[-60,60]]}],inside,edgeClearM:.5});
 assert.deepEqual(west.candidates.slice(0,2).map(c=>c.azimuthDeg),[225,315],'rotationY pi/2 sends the nose to -x, so the front bearing is 270 and the best cameras are at 225 and 315');assert.ok(west.candidates.every(c=>c.eye[0]<=-10.5+1e-9));
 for(const c of cams.candidates) {near(horizontal(c.eye,cams.focusWorld),25,1e-9);near(c.eye[1],2.6,1e-12);assert.equal(c.near,.25);assert.equal(c.platform,'P');}
 // CHANGED (V10 thinned-out neighbours): the two-degree gap is a property of the spread pass, not of the whole list (the neighbours are what thinning dropped)
 const gaps=cams.candidates.filter(c=>c.pass==='spread').map(c=>c.azimuthDeg).sort((p,q)=>p-q).map((a,i,all)=>i?a-all[i-1]:99);assert.equal(gaps.length,48);assert.ok(gaps.every(g=>g>=2),`azimuths are 2 degrees apart at least: ${gaps}`);
 assert.deepEqual(F.stationCameras({placement:{position:[0,0,0],rotationY:Math.PI},spec,platforms,inside,edgeClearM:.5}).candidates.slice(0,2).map(c=>c.azimuthDeg),[45,315],'a train turned about faces the other way');
 // a 4 m wide platform leaves only the points a half metre in from both its edges, whatever the bearing
 const sliver=F.stationCameras({placement,spec,platforms:[{ref:'S',pts:[[10,-60],[14,-60],[14,60],[10,60]]}],inside,edgeClearM:.5});
 // CHANGED (V10 thinned-out neighbours): the count of at least eight is the spread's (`candidates` is now every position)
 assert.ok(sliver.spreadCount>=8&&sliver.candidateCount<=24&&sliver.candidates.length===sliver.candidateCount,`${sliver.spreadCount} of ${sliver.candidateCount}`);assert.ok(sliver.candidates.every(c=>c.platform==='S'&&c.eye[0]>=10.5-1e-9&&c.eye[0]<=13.5+1e-9),'only points a half metre inside the sliver');
 // thinning: the first `max` of the order, skipping neighbours
 const ordered=[10,11,12,13,20,21,40].map(azimuthDeg=>({azimuthDeg}));
 assert.deepEqual(F.thinCandidates(ordered,2,10).map(c=>c.azimuthDeg),[10,12,20,40]);assert.deepEqual(F.thinCandidates(ordered,2,3).map(c=>c.azimuthDeg),[10,12,20]);assert.deepEqual(F.thinCandidates([{azimuthDeg:359},{azimuthDeg:1},{azimuthDeg:3}],5,9).map(c=>c.azimuthDeg),[359],'azimuth wraps at 360');
 assert.deepEqual(F.thinCandidates(ordered).map(c=>c.azimuthDeg),[10,12,20,40],'the defaults are the catalogue limits');assert.deepEqual([F.CATALOGUE.stationMaxCandidates,F.CATALOGUE.stationMinSeparationDeg,F.CATALOGUE.platformEdgeClearM,F.CATALOGUE.stationFrontAngleDeg],[48,2,.5,45]);
});

test('every V10 camera of every kind stands on a real platform, 2.6 m up, exactly 25, 75 or 150 m from its focus, in both placements',()=>{
 const byRef=new Map(station.platforms.map(p=>[p.ref,p.pts]));
 for(const kind of ALL_KINDS) {
  const plan=stationPlans.get(kind);assert.deepEqual(plan.views.map(v=>[v.suffix,v.status]),F.STATION_VIEWS.map(s=>[s,'OK']),`${kind}: every view has cameras to search`);
  for(const p of plan.placements) for(const v of p.views) {
   // CHANGED (V10 thinned-out neighbours): the list is every position over a platform; the 48-camera limit is the spread's (`spreadCount`), and the neighbours follow it
   const spec=plan.specs.find(s=>s.suffix===v.suffix);assert.ok(v.spreadCount>0&&v.spreadCount<=48&&v.candidates.length===v.candidateCount&&v.candidateCount>=v.spreadCount,`${kind} ${p.id} ${v.suffix}`);
   assert.deepEqual(v.candidates.map(c=>c.pass),v.candidates.map((c,i)=>i<v.spreadCount?'spread':'neighbour'),`${kind} ${p.id} ${v.suffix}: spread first, then neighbours`);
   vec(v.focusWorld,F.placedPoint(p,spec.focusLocal),1e-9);
   for(const c of v.candidates) {
    near(horizontal(c.eye,v.focusWorld),spec.distanceM,1e-6,`${kind} ${p.id} ${v.suffix} az ${c.azimuthDeg}`);near(c.eye[1],PLATFORM_HEIGHT+1.7,1e-12);
    const outline=byRef.get(c.platform);assert.ok(outline,'a real platform');assert.ok(pointInPolygon([c.eye[0],c.eye[2]],outline));assert.ok(F.polygonEdgeDistance([c.eye[0],c.eye[2]],outline)>=.5);
    assert.equal(c.near,F.catalogueNear(c.eye,v.focusWorld));
   }
  }
 }
 // no platform at all: every view is a GAP before any page is asked
 const bare=planOf('lner5',{...station,platforms:[]});
 assert.deepEqual(bare.views.map(v=>v.status),Array(6).fill('GAP'));assert.match(bare.views[0].reason,/no platform point lies exactly 25 m from the cab focus, in any placement/);assert.match(bare.views[5].reason,/150 m from the coach focus/);
 // the half metre of clearance is the planner's own default: a 4 m wide strip 10 to 14 m east of the cab focus offers cameras only 10.5 to 13.5 m east of it
 const focus0=stationPlans.get('lner5').placements[0].views[0].focusWorld,strip=[[focus0[0]+10,focus0[2]-80],[focus0[0]+14,focus0[2]-80],[focus0[0]+14,focus0[2]+80],[focus0[0]+10,focus0[2]+80]];
 const narrow=planOf('lner5',{...station,platforms:[{ref:'S',pts:strip}],stopIndexes:[3],orientations:['nose-at-buffers']}).placements[0].views[0];
 // CHANGED (V10 thinned-out neighbours): at least four in the spread (it was `candidates.length`, the thinned list)
 assert.ok(narrow.spreadCount>=4&&narrow.candidateCount<=24,`${narrow.spreadCount} of ${narrow.candidateCount}`);assert.ok(narrow.candidates.every(c=>c.platform==='S'&&c.eye[0]-focus0[0]>=10.5-1e-9&&c.eye[0]-focus0[0]<=13.5+1e-9),'no camera within a half metre of the strip edge');
 assert.equal(planOf('lner5',{...station,stops:[]}).placements.length,0,'no stop, no placement');
 assert.deepEqual(planOf('lner5',{...station,stopIndexes:[1,3],orientations:['nose-at-buffers']}).placements.map(p=>p.id),['stop-1-nose-at-buffers','stop-3-nose-at-buffers']);
});

test('V10 tries the spread of cameras first and then the neighbours that thinning dropped, each position over a platform once',()=>{
 const square=[[-60,-60],[60,-60],[60,60],[-60,60]],platforms=[{ref:'P',pts:square}],inside=pointInPolygon;
 const placement={position:[0,0,0],rotationY:0},spec={suffix:'s',distanceM:25,focus:'cab',focusLocal:[0,1.7,0]};
 const cameras=args=>calm(()=>F.stationCameras({placement,spec,platforms,inside,edgeClearM:.5,...args}),'stationCameras'),cams=cameras({});
 const raw=F.stationCandidates({focusXZ:[0,0],distanceM:25,platforms,inside,edgeClearM:.5,preferredBearingsDeg:[135,225]}),kept=F.thinCandidates(raw);
 const rawAz=raw.map(c=>c.azimuthDeg),keptAz=kept.map(c=>c.azimuthDeg),dropped=rawAz.filter(a=>!keptAz.includes(a));
 // the spread is the list the search has always tried, in the same order (so every camera it accepted is still at the same place); the neighbours follow, best first again
 assert.deepEqual(cams.candidates.slice(0,cams.spreadCount).map(c=>c.azimuthDeg),keptAz);assert.deepEqual(cams.candidates.slice(cams.spreadCount).map(c=>c.azimuthDeg),dropped);
 assert.deepEqual([cams.spreadCount,cams.candidateCount,cams.candidates.length],[kept.length,raw.length,raw.length]);assert.equal(new Set(cams.candidates.map(c=>c.azimuthDeg)).size,360,'every position once');
 assert.deepEqual(cams.candidates.map(c=>c.pass),cams.candidates.map((c,i)=>i<kept.length?'spread':'neighbour'));
 // a neighbour is a real camera: the same distance, height, platform and near plane rules as a spread one, and the same exact eye the position gives
 for(const c of cams.candidates.slice(cams.spreadCount)) {near(horizontal(c.eye,cams.focusWorld),25,1e-9);near(c.eye[1],2.6,1e-12);assert.equal(c.platform,'P');assert.equal(c.near,.25);}
 const first=cams.candidates[cams.spreadCount],pose=F.stationPose({candidate:raw.find(c=>c.azimuthDeg===first.azimuthDeg),focus:cams.focusWorld,distanceM:25});vec(first.eye,pose.eye,1e-12);
 // the limits move the boundary between the passes, not the set of positions: a tighter max and a wider separation both leave more neighbours
 const few=cameras({max:5});assert.deepEqual([few.spreadCount,few.candidates.length],[5,360]);assert.deepEqual(few.candidates.slice(0,5).map(c=>c.azimuthDeg),keptAz.slice(0,5));assert.equal(few.candidates[5].pass,'neighbour');
 assert.equal(new Set(few.candidates.map(c=>c.azimuthDeg)).size,360,'positions past max are neighbours, not lost');
 const wide=cameras({minSeparationDeg:10});assert.ok(wide.spreadCount<kept.length&&wide.spreadCount>=30&&wide.spreadCount<=36,`${wide.spreadCount}`);assert.equal(wide.candidates.length,360);
 // nothing to thin: positions five degrees apart are all in the spread, and there are no neighbours
 const sparse=cameras({stepDeg:5,max:100});assert.deepEqual([sparse.spreadCount,sparse.candidateCount,sparse.candidates.length],[72,72,72]);assert.ok(sparse.candidates.every(c=>c.pass==='spread'));
 // the real station: the Pendolino's 150 m coach view has 17 positions over platforms and the spread keeps 12, which is where the round-2 search stopped
 const view150=stationPlans.get('tl700x8').placements[0].views.find(v=>v.suffix==='station-150m-coach');
 assert.deepEqual([view150.candidateCount,view150.spreadCount,view150.candidates.length],[17,12,17]);assert.deepEqual(view150.candidates.slice(12).map(c=>[c.azimuthDeg,c.platform]),[[201,'10'],[163,'0'],[165,'1'],[171,'3'],[182,'7']]);
});

test('a V10 view whose spread has no clear camera goes on to the neighbours, and its record says which pass found the camera and how many of each were inspected',()=>{
 const plan=stationPlans.get('tl700x8'),A=plan.placements[0].id,planned=plan.placements[0].views.find(v=>v.suffix==='station-150m-coach'),extra=planned.candidateCount-planned.spreadCount;
 assert.ok(extra>0,'the real station has a view with neighbours');
 const accepted=index=>F.stationViewsFromSearch(plan,fakeReport(plan,{[A]:{...allAt(plan,A)[A],'station-150m-coach':index}})).find(v=>v.suffix==='station-150m-coach');
 // the third neighbour is the first clear camera: it is the view's pose, and the spread (all of it) and two neighbours were rejected before it
 const index=planned.spreadCount+2,late=accepted(index);
 assert.equal(late.status,'OK');vec(late.eye,planned.candidates[index].eye,1e-12);assert.equal(late.azimuthDeg,planned.candidates[index].azimuthDeg);assert.equal(late.platform,planned.candidates[index].platform);assert.equal(late.near,planned.candidates[index].near);
 assert.deepEqual([late.search.tested,late.search.candidateCount,late.search.spreadCount,late.search.testedSpread,late.search.testedNeighbours,late.search.pass],[index+1,planned.candidateCount,planned.spreadCount,planned.spreadCount,3,'neighbour']);
 assert.equal(late.search.rejectedBefore.length,index);
 // a camera from the spread says so, and tested no neighbour
 const early=accepted(3);assert.deepEqual([early.search.tested,early.search.testedSpread,early.search.testedNeighbours,early.search.pass,early.search.spreadCount,early.search.candidateCount],[4,4,0,'spread',planned.spreadCount,planned.candidateCount]);
 // the first neighbour is the first position after the spread
 assert.equal(accepted(planned.spreadCount).search.pass,'neighbour');assert.equal(accepted(planned.spreadCount-1).search.pass,'spread');
 // nothing clear: every position was inspected, and the reason and the counts say both passes were
 const gap=accepted(null);assert.equal(gap.status,'GAP');assert.deepEqual([gap.search.tested,gap.search.candidateCount,gap.search.testedSpread,gap.search.testedNeighbours],[planned.candidateCount,planned.candidateCount,planned.spreadCount,extra]);
 assert.match(gap.reason,new RegExp(`^no clear camera: ${planned.candidateCount} of ${planned.candidateCount} candidate positions over platforms were inspected \\(${planned.spreadCount} spread over the platforms, then ${extra} thinned-out neighbours\\); blocked by `));
 // a search that stopped inside the spread reports no neighbours tested, and does not claim the other positions were inspected
 const partial=F.stationViewsFromSearch(plan,[{placementId:A,clear:0,views:{'station-150m-coach':{tested:5,accepted:null,tried:Array(5).fill({clear:false,reason:'coach occluded',blocker:'X/bench'})}}}]).find(v=>v.suffix==='station-150m-coach');
 assert.deepEqual([partial.search.tested,partial.search.testedSpread,partial.search.testedNeighbours],[5,5,0]);assert.match(partial.reason,new RegExp(`^no clear camera: 5 of ${planned.candidateCount} candidate positions over platforms were inspected \\(5 spread over the platforms, then 0 thinned-out neighbours\\)`));
});

test('the V10 search chooses the first placement with every view clear, else the first with the most, and says what blocked the rest',()=>{
 assert.equal(F.chooseStation([]),-1);assert.equal(F.chooseStation([{clear:2},{clear:6}]),1);assert.equal(F.chooseStation([{clear:6},{clear:6}]),0);assert.equal(F.chooseStation([{clear:3},{clear:3},{clear:2}]),0);assert.equal(F.chooseStation([{clear:0}]),0);
 const tried=[{clear:false,reason:'coach occluded',blocker:'A/bench'},{clear:false,reason:'coach occluded',blocker:'A/bench'},{clear:true},{clear:false,reason:'camera inside a mesh',blocker:'A/lamp'},{clear:false,reason:'sample has no visible train surface',blocker:null},{clear:false,reason:'camera inside a mesh',blocker:'A/lamp'},{clear:false,reason:'coach occluded',blocker:'A/bench'}];
 assert.deepEqual(F.failureSummary(tried),[['A/bench (coach occluded)',3],['A/lamp (camera inside a mesh)',2],['sample has no visible train surface',1]]);assert.deepEqual(F.failureSummary(tried,1),[['A/bench (coach occluded)',3]]);assert.deepEqual(F.failureSummary([]),[]);
 assert.deepEqual(F.failureSummary([{clear:false,reason:'b'},{clear:false,reason:'a'}]),[['a',1],['b',1]],'ties are in name order');
 const plan=stationPlans.get('lner5'),[A,B]=plan.placements.map(p=>p.id);
 // placement B has all six clear: it is chosen over A with two, and the OK views are B's own cameras
 let views=F.stationViewsFromSearch(plan,fakeReport(plan,{[A]:{'station-25m':0,'station-75m':2},[B]:Object.fromEntries(plan.views.map((v,i)=>[v.suffix,i%2]))}));
 assert.deepEqual(views.map(v=>v.status),Array(6).fill('OK'));assert.ok(views.every(v=>v.placement.id===B&&v.frame==='station'&&v.fov===50&&v.id==='V10'&&v.reason===null));
 views.forEach((v,i)=>{const planned=plan.placements[1].views[i],c=planned.candidates[i%2];vec(v.eye,c.eye,1e-12);vec(v.target,planned.focusWorld,1e-12);assert.equal(v.near,c.near);assert.equal(v.azimuthDeg,c.azimuthDeg);assert.equal(v.platform,c.platform);assert.deepEqual(v.up,[0,1,0]);assert.equal(v.platformHeightM,.9);
  near(horizontal(v.eye,v.target),v.distanceM,1e-6);assert.equal(v.search.chosen,B);assert.deepEqual(v.search.placements,[{id:A,clear:2},{id:B,clear:6}]);assert.equal(v.search.rejectedBefore.length,i%2);});
 assert.deepEqual(views[0].rotation,{ruleId:'station-placement',basis:views[0].rotation.basis,rotationY:plan.placements[1].rotationY,orientation:'cab-at-north-end'});
 // the search stops at the first full placement, so a report with only A in it chooses A
 views=F.stationViewsFromSearch(plan,fakeReport(plan,allAt(plan,A)));assert.ok(views.every(v=>v.status==='OK'&&v.placement.id===A));
 // neither full: the first with the most clear; the others are GAPs that count what was inspected and name what blocked it
 views=F.stationViewsFromSearch(plan,fakeReport(plan,{[A]:{'station-25m':0,'station-75m':0,'station-150m':0},[B]:{'station-25m':0,'station-75m':0,'station-150m':0,'station-25m-coach':0}}));
 assert.deepEqual(views.map(v=>v.status),['OK','OK','OK','OK','GAP','GAP']);assert.ok(views.slice(0,4).every(v=>v.placement.id===B));
 const gap=views[4],cams=plan.placements[1].views[4];assert.equal(gap.eye,undefined);assert.equal(gap.target,undefined);assert.equal(gap.blocker,'Scene/furniture/benches (coach occluded)');
 // CHANGED (V10 thinned-out neighbours): a view is a GAP only after every position over a platform was tried, and the reason says how many were the spread and how many the neighbours
 assert.equal(gap.reason,`no clear camera: ${cams.candidates.length} of ${cams.candidateCount} candidate positions over platforms were inspected (${cams.spreadCount} spread over the platforms, then ${cams.candidates.length-cams.spreadCount} thinned-out neighbours); blocked by Scene/furniture/benches (coach occluded) x${cams.candidates.length}`);
 assert.deepEqual(gap.search.failures,[['Scene/furniture/benches (coach occluded)',cams.candidates.length]]);assert.equal(gap.search.tested,cams.candidates.length);assert.equal(gap.search.candidateCount,cams.candidateCount);assert.equal(gap.notes.placement,B);
 assert.deepEqual([gap.search.tested,gap.search.candidateCount,gap.search.spreadCount,gap.search.testedSpread,gap.search.testedNeighbours],[cams.candidateCount,cams.candidateCount,cams.spreadCount,cams.spreadCount,cams.candidateCount-cams.spreadCount]);
 const none=F.stationViewsFromSearch(plan,[]);assert.ok(none.every(v=>v.status==='GAP'&&v.reason==='no placement could be searched'&&v.placement===undefined&&v.search.chosen===null));
 const bare=planOf('lner5',{...station,platforms:[]}),bareViews=F.stationViewsFromSearch(bare,fakeReport(bare,{[bare.placements[0].id]:{}}));assert.ok(bareViews.every(v=>v.status==='GAP'&&/no platform point lies exactly/.test(v.reason)));
 assert.deepEqual(views[0].notes,{focus:views[0].focus,distanceM:25,azimuthDeg:views[0].azimuthDeg,platform:views[0].platform,placement:B,orientation:'cab-at-north-end',stop:plan.placements[1].stop,eyeAbovePlatformM:1.7,platformHeightM:.9,sceneryKept:true});
 assert.deepEqual(views[0].focus,{name:'cab',local:[0,1.7,1.5],world:plan.placements[1].views[0].focusWorld});
});

test('frozen V10 poses are reused exactly without a search, a frozen GAP stays a GAP, and any pose that moved or can no longer be derived is refused with where',()=>{
 const plan=stationPlans.get('gn387x12'),[A,B]=plan.placements.map(p=>p.id);
 const views=F.stationViewsFromSearch(plan,fakeReport(plan,{[A]:{'station-25m':1,'station-75m':1},[B]:{...allAt(plan,B,2)[B],'station-150m-coach':null}}));
 assert.deepEqual(views.map(v=>v.status),['OK','OK','OK','OK','OK','GAP'],'placement B has five clear views against two, so it is the one frozen');
 const held=manifestOf(views),drift=change=>{const m=JSON.parse(JSON.stringify(held));change(m.views);return F.stationFrozenDrift(plan,m);};
 assert.deepEqual(F.stationFrozenDrift(plan,held),[],'what a search accepted is what the frozen file derives');
 const again=F.stationViewsFromFrozen(plan,held);assert.deepEqual(again.map(v=>v.status),views.map(v=>v.status));
 again.slice(0,5).forEach((v,i)=>{vec(v.eye,views[i].eye,1e-12);vec(v.target,views[i].target,1e-12);assert.equal(v.near,views[i].near);assert.equal(v.azimuthDeg,views[i].azimuthDeg);assert.equal(v.platform,views[i].platform);assert.equal(v.placement.id,B);assert.deepEqual(v.search,{frozen:true});assert.deepEqual(v.region,views[i].region);assert.deepEqual(v.focus,views[i].focus);near(v.rotation.rotationY,plan.placements[1].rotationY,1e-12);});
 assert.equal(again[5].status,'GAP');assert.equal(again[5].eye,undefined);assert.equal(again[5].reason,views[5].reason,'the reason it was frozen with');assert.equal(again[5].blocker,views[5].blocker);assert.deepEqual(again[5].search,{frozen:true});
 assert.equal(again[5].placement?.id,B,'a frozen GAP keeps the placement it was found in');assert.deepEqual(again[5].focus,views[5].focus);assert.deepEqual(again[5].rotation,views[5].rotation);assert.deepEqual(again[5].notes,views[5].notes);
 // a replay freezes to the numbers it replays, so its own manifest is as good a poses file as the first
 for(const v of again) assert.equal(F.poseDifference(F.poseOf(v),held.views[v.suffix].plan),null,`${v.suffix} freezes to its frozen numbers`);
 assert.deepEqual(F.stationFrozenDrift(plan,manifestOf(again)),[]);assert.deepEqual(F.stationViewsFromFrozen(plan,manifestOf(again)).map(v=>[v.status,v.reason,v.blocker??null]),again.map(v=>[v.status,v.reason,v.blocker??null]),'and a replay of a replay says the same');
 assert.equal(F.stationViewsFromFrozen(plan,undefined).every(v=>v.status==='GAP'&&/no reason recorded/.test(v.reason)),true);
 assert.deepEqual(F.poseDifference(F.poseOf(again[0]),held.views['station-25m'].plan),null,'a frozen view freezes to itself');
 assert.equal(drift(v=>{v['station-25m'].plan.eye[0]+=.001;})[0]?.at,'/eye/0');assert.equal(drift(v=>{v['station-75m'].plan.eye[2]-=.01;})[0]?.reason,'pose differs from the frozen pose');assert.equal(drift(v=>{v['station-75m'].plan.target[1]=1.8;})[0]?.at,'/target/1');
 assert.equal(drift(v=>{v['station-150m'].plan.near*=2;})[0]?.at,'/near');assert.equal(drift(v=>{v['station-25m'].plan.platform='X';})[0]?.at,'/platform');assert.equal(drift(v=>{v['station-25m-coach'].plan.region.max[2]+=1;})[0]?.at,'/region/max/2');
 assert.deepEqual(drift(v=>{v['station-25m'].plan.eye[0]+=1e-9;}),[],'a nanometre is inside the tolerance');
 assert.deepEqual(drift(v=>{delete v['station-75m'];}).map(d=>[d.view,d.reason]),[['station-75m','view missing from the frozen poses']]);assert.deepEqual(drift(v=>{delete v['station-75m'].plan;}).map(d=>d.reason),['view missing from the frozen poses']);
 assert.deepEqual(drift(v=>{v['station-25m'].plan.placement.id='stop-9-nose-at-buffers';}).map(d=>[d.reason,d.at]),[['frozen placement is not one this run derives','/placement/id']]);
 assert.deepEqual(drift(v=>{v['station-75m'].plan.placement.id=A;}).map(d=>[d.view,d.reason]),[['station-75m','views of one kind must share one placement']]);
 assert.equal(drift(v=>{v['station-25m'].plan.placement.position[0]+=.01;})[0]?.reason,'placement differs from the frozen placement');assert.equal(drift(v=>{v['station-25m'].plan.placement.rotationY+=.01;})[0]?.at,'/placement/rotationY');
 assert.equal(drift(v=>{v['station-25m'].plan.placement.stop.id=1;})[0]?.at,'/placement/stop/id');assert.equal(drift(v=>{v['station-25m'].plan.placement.orientation='x';})[0]?.at,'/placement/orientation');
 // the camera is re-derived from the frozen placement and azimuth: a bearing with no platform under it, and a bearing over another platform point, are both refused
 const focus25=F.placedPoint(plan.placements[1],plan.specs[0].focusLocal),cameraAt=az=>F.stationCameraAt({focusXZ:[focus25[0],focus25[2]],distanceM:25,azimuthDeg:az,platforms:plan.context.platforms,inside:plan.context.inside,edgeClearM:plan.context.edgeClearM});
 const bearings=[...Array(360).keys()],off=bearings.find(az=>!cameraAt(az)),elsewhere=bearings.find(az=>cameraAt(az)&&az!==views[0].azimuthDeg);assert.ok(off!==undefined&&elsewhere!==undefined);
 assert.deepEqual(drift(v=>{v['station-25m'].plan.azimuthDeg=off;}).map(d=>[d.reason,d.at]),[['the frozen camera is no longer over a platform','/azimuthDeg']]);
 assert.deepEqual(drift(v=>{v['station-25m'].plan.azimuthDeg=elsewhere;}).map(d=>d.reason),['pose differs from the frozen pose'],'the frozen eye is not where that bearing puts the camera');
 assert.deepEqual(drift(v=>{v['station-25m'].plan.azimuthDeg+=360;}),[],'a full turn is the same bearing');
 assert.deepEqual(drift(v=>{v['station-150m-coach'].plan.status='OK';}).map(d=>d.reason),['the frozen camera is no longer over a platform'],'a GAP edited to OK has no camera to derive');
 assert.deepEqual(drift(v=>{v['station-25m'].plan.status='GAP';}),[],'a view frozen as a GAP is not checked');
 // the check is against what this run derives: with no platforms left, no frozen camera can stand anywhere
 const stripped=planOf('gn387x12',{...station,platforms:[]});assert.ok(F.stationFrozenDrift({...stripped,placements:plan.placements,context:stripped.context},held).some(d=>d.reason==='the frozen camera is no longer over a platform'));
});

// ---- V10 on frozen poses when the scene has moved on: a blocked frozen camera is searched for again ---------------------------------------
const reseatFixture=()=>{
 const plan=stationPlans.get('lner5'),B=plan.placements[1].id,held=F.stationViewsFromSearch(plan,fakeReport(plan,allAt(plan,B))),frozen=F.stationViewsFromFrozen(plan,manifestOf(held));
 const okResult=view=>({view,status:'OK',reason:null,inspection:{clear:true},file:`lner5-${view.suffix}.png`,attempts:1});
 const blockedResult=(view,blocker='Scene/furniture/benches')=>({view,status:'GAP',reason:'coach occluded',blocker,inspection:{clear:false,reason:'coach occluded',blocker},attempts:1});
 return {plan,B,frozen,okResult,blockedResult};
};

test('a frozen V10 camera the scene now blocks is searched for again in its own placement: the replacement names the camera it replaces, a view with no clear camera stays a GAP that says both',()=>{
 const {plan,B,frozen,blockedResult}=reseatFixture();
 assert.ok(frozen.every(v=>v.status==='OK'&&v.search.frozen===true&&v.placement.id===B));
 // the scene moved: 'station-150m' is blocked by a help point and 'station-75m-coach' by an overhead-line mast; the search of B finds the second candidate for the first and none for the second
 const blocked=[blockedResult(frozen.find(v=>v.suffix==='station-150m'),'Scene/furniture/help-points'),blockedResult(frozen.find(v=>v.suffix==='station-75m-coach'),'Scene/ole/ole-steel')];
 const report=fakeReport(plan,{[B]:{...allAt(plan,B)[B],'station-150m':1,'station-75m-coach':null}});
 const {replacements,stays}=F.reseatBlockedStationViews(plan,blocked,report);
 assert.deepEqual(replacements.map(v=>v.suffix),['station-150m'],'only a blocked view the search found a camera for is replaced');
 const r=replacements[0],cam=plan.placements[1].views.find(v=>v.suffix==='station-150m').candidates[1],was=frozen.find(v=>v.suffix==='station-150m');
 assert.equal(r.status,'OK');assert.equal(r.id,'V10');assert.equal(r.placement.id,B);vec(r.eye,cam.eye,1e-12);assert.equal(r.azimuthDeg,cam.azimuthDeg);assert.equal(r.platform,cam.platform);assert.equal(r.near,cam.near);
 assert.notDeepEqual(r.eye,was.eye,'it is another camera than the frozen one');near(horizontal(r.eye,r.target),150,1e-6,'and V10\'s rule holds: exactly the view\'s distance from its focus');near(r.eye[1],.9+1.7,1e-9,'1.7 m over the platform');
 assert.equal(r.search.frozen,undefined,'it is a searched camera now, not a frozen one');assert.equal(r.search.chosen,B);assert.equal(r.search.rejectedBefore.length,1);assert.equal(r.search.pass,cam.pass);
 assert.deepEqual(r.search.replacesFrozen,{eye:was.eye,azimuthDeg:was.azimuthDeg,platform:was.platform,reason:'coach occluded',blocker:'Scene/furniture/help-points'});
 assert.deepEqual(r.target,was.target,'the view looks at the same point: only the camera moved');assert.deepEqual(r.focus,was.focus);assert.deepEqual(r.region,was.region);assert.deepEqual(r.rotation,was.rotation,'the specimen stands as it did');
 // the other stays the GAP it was: its reason says what blocked the frozen camera and what the new search found
 assert.deepEqual([...stays.keys()],['station-75m-coach']);
 const cams=plan.placements[1].views.find(v=>v.suffix==='station-75m-coach');
 assert.equal(stays.get('station-75m-coach'),`coach occluded; searched again in ${B}: no clear camera: ${cams.candidates.length} of ${cams.candidateCount} candidate positions over platforms were inspected (${cams.spreadCount} spread over the platforms, then ${cams.candidates.length-cams.spreadCount} thinned-out neighbours); blocked by Scene/furniture/benches (coach occluded) x${cams.candidates.length}`);
 // nothing asked for, nothing returned, whatever the search found
 assert.deepEqual(F.reseatBlockedStationViews(plan,[],report),{replacements:[],stays:new Map()});
 // a placement the search could not run in leaves the view the GAP it was, and says so
 const none=F.reseatBlockedStationViews(plan,[blocked[0]],[]);assert.equal(none.replacements.length,0);assert.match(none.stays.get('station-150m'),/^coach occluded; searched again in .+: no placement could be searched$/);
 // a result for a view this plan does not have is another plan's: that is a defect in the run, not a view to give up on
 assert.throws(()=>F.reseatBlockedStationViews(plan,[{...blocked[0],view:{...blocked[0].view,suffix:'station-300m'}}],report),/station-300m is not a V10 view of this plan/);
});

test('reseatStationResults searches only for a frozen V10 camera found blocked, only in the placement it was frozen in, photographs only what the search found, and leaves every other result as recorded',async()=>{
 const {plan,B,frozen,okResult,blockedResult}=reseatFixture(),A=plan.placements[0].id;
 const calls={search:[],capture:[]};
 const searchWith=accepts=>async placements=>{calls.search.push(placements.map(p=>p.id));return fakeReport(plan,accepts).filter(r=>placements.some(p=>p.id===r.placementId));};
 const capture=async views=>{calls.capture.push(views.map(v=>v.suffix));return views.map(okResult);};
 const reset=()=>{calls.search=[];calls.capture=[];};
 // nothing blocked: no search, no photograph, the very same results
 const clear=frozen.map(okResult);
 let out=await reseat({results:clear,station:plan,search:searchWith(allAt(plan,B)),capture});
 assert.equal(out.results,clear);assert.equal(out.report,null);assert.deepEqual(calls,{search:[],capture:[]});
 // the first view blocked: placement B alone is searched (not A), only that view's replacement is photographed, and the rest are the same results in the same places
 const results=frozen.map((v,i)=>i===0?blockedResult(v):okResult(v));
 out=await reseat({results,station:plan,search:searchWith({[A]:allAt(plan,A,0)[A],[B]:{...allAt(plan,B)[B],[frozen[0].suffix]:2}}),capture});
 assert.deepEqual(calls,{search:[[B]],capture:[[frozen[0].suffix]]});assert.deepEqual(out.report?.map(r=>r.placementId),[B],'the search report is returned');
 assert.deepEqual(out.results.map(r=>r.view.suffix),frozen.map(v=>v.suffix),'in their places');assert.equal(out.results[0].status,'OK');assert.equal(out.results[0].file,`lner5-${frozen[0].suffix}.png`);
 assert.equal(out.results[0].view.search.replacesFrozen?.blocker,'Scene/furniture/benches','the replacement names the camera it replaces');assert.notEqual(out.results[0].view,frozen[0]);
 out.results.slice(1).forEach((r,i)=>assert.equal(r,results[i+1],`${r.view.suffix} is untouched`));
 // no clear camera for the blocked view: nothing is photographed, and its result is the GAP it was with a reason that says both
 reset();out=await reseat({results,station:plan,search:searchWith({[B]:{...allAt(plan,B)[B],[frozen[0].suffix]:null}}),capture});
 assert.deepEqual(calls,{search:[[B]],capture:[]},'a search, and no photograph');assert.equal(out.results[0].status,'GAP');assert.match(out.results[0].reason,new RegExp(`^coach occluded; searched again in ${B}: no clear camera: `));
 assert.equal(out.results[0].blocker,'Scene/furniture/benches');assert.equal(out.results[0].view,frozen[0]);assert.deepEqual(out.results[0].inspection,results[0].inspection);out.results.slice(1).forEach((r,i)=>assert.equal(r,results[i+1]));assert.equal(out.report?.length,1,'the search report is returned');
 // what is not a frozen V10 camera found blocked (or a view frozen as a GAP, the next test) is never searched for again: a GAP that this run's own search recorded (CHANGED (frozen GAP re-search): a GAP
 // frozen from an earlier run is searched for again now, so this entry is one that is not frozen), one that was not frozen, one that failed on its pixels (its inspection was clear), and a stage view
 reset();
 const odd=[{...blockedResult(frozen[0]),view:{...frozen[0],status:'GAP',search:{chosen:B}}},{...blockedResult(frozen[1]),view:{...frozen[1],search:{chosen:B}}},{...blockedResult(frozen[2]),inspection:{clear:true}},
  {view:{id:'V03',suffix:'front-3m',status:'OK',search:{frozen:true},placement:{id:B}},status:'GAP',reason:'x',inspection:{clear:false}},
  {...blockedResult(frozen[3]),status:'OK'}];
 out=await reseat({results:odd,station:plan,search:searchWith(allAt(plan,B)),capture});assert.equal(out.results,odd);assert.equal(out.report,null);assert.deepEqual(calls,{search:[],capture:[]});
 // a frozen placement this plan does not have is not searched for (the drift check refuses such a file first)
 out=await reseat({results:[{...blockedResult(frozen[0]),view:{...frozen[0],placement:{id:'stop-9-nowhere'}}}],station:plan,search:searchWith(allAt(plan,B)),capture});assert.equal(out.report,null);assert.deepEqual(calls,{search:[],capture:[]});
 // two views blocked, one found and one not: the one is photographed, the other keeps its GAP
 reset();out=await reseat({results:frozen.map((v,i)=>i<2?blockedResult(v):okResult(v)),station:plan,search:searchWith({[B]:{...allAt(plan,B)[B],[frozen[0].suffix]:null,[frozen[1].suffix]:1}}),capture});
 assert.deepEqual(calls.capture,[[frozen[1].suffix]]);assert.deepEqual(out.results.slice(0,2).map(r=>r.status),['GAP','OK']);
});

test('a V10 view frozen as a GAP is an earlier answer too: it is searched for again in its own placement, so a rule that tries more positions can find it a camera, and a GAP that stays says how many were inspected',async()=>{
 const plan=stationPlans.get('lner5'),A=plan.placements[0].id,B=plan.placements[1].id,suffix='station-150m-coach';
 // round 2's search stopped at the spread: the view was frozen as a GAP, with its placement, its reason and its blocker
 const held=F.stationViewsFromSearch(plan,fakeReport(plan,{[B]:{...allAt(plan,B)[B],[suffix]:null}})),frozen=F.stationViewsFromFrozen(plan,manifestOf(held)),gap=frozen.find(v=>v.suffix===suffix);
 assert.ok(gap.status==='GAP'&&gap.search?.frozen===true&&gap.placement?.id===B&&gap.blocker,'the fixture: a view frozen as a GAP that keeps its placement and its blocker');
 const okResult=view=>({view,status:'OK',reason:null,inspection:{clear:true},file:`lner5-${view.suffix}.png`,attempts:1}),gapResult=view=>({view,status:'GAP',reason:view.reason,attempts:0});
 const results=frozen.map(v=>v===gap?gapResult(v):okResult(v)),calls={search:[],capture:[]};
 const searchWith=accepts=>async placements=>{calls.search.push(placements.map(p=>p.id));return fakeReport(plan,accepts).filter(r=>placements.some(p=>p.id===r.placementId));};
 const capture=async views=>{calls.capture.push(views.map(v=>v.suffix));return views.map(okResult);};
 const reset=()=>{calls.search=[];calls.capture=[];};
 // the search finds a camera: the placement alone is searched, only that view is photographed and takes its place, and what it replaces has no camera, only the reason and the blocker it was frozen with
 let out=await reseat({results,station:plan,search:searchWith({[A]:allAt(plan,A,0)[A],[B]:{...allAt(plan,B)[B],[suffix]:1}}),capture});
 assert.deepEqual(calls,{search:[[B]],capture:[[suffix]]});assert.deepEqual(out.report?.map(r=>r.placementId),[B],'the search report is returned');
 const done=out.results.find(r=>r.view.suffix===suffix),cam=plan.placements[1].views.find(v=>v.suffix===suffix).candidates[1];
 assert.equal(done.status,'OK');assert.equal(done.file,`lner5-${suffix}.png`);vec(done.view.eye,cam.eye,1e-12);near(horizontal(done.view.eye,done.view.target),150,1e-6,'and V10\'s rule holds');assert.equal(done.view.search.frozen,undefined);
 assert.deepEqual(done.view.search.replacesFrozen,{eye:null,azimuthDeg:null,platform:null,reason:gap.reason,blocker:gap.blocker});
 assert.deepEqual(out.results.map(r=>r.view.suffix),frozen.map(v=>v.suffix),'in their places');out.results.filter(r=>r!==done).forEach(r=>assert.ok(results.includes(r),`${r.view.suffix} is untouched`));
 // the search finds none: nothing is photographed, and the GAP keeps its place, its view and what it was, with a reason that says what it was and what the new search inspected
 reset();out=await reseat({results,station:plan,search:searchWith({[B]:{...allAt(plan,B)[B],[suffix]:null}}),capture});
 assert.deepEqual(calls,{search:[[B]],capture:[]},'a search, and no photograph');
 const stays=out.results.find(r=>r.view.suffix===suffix),cams=plan.placements[1].views.find(v=>v.suffix===suffix);
 assert.equal(stays.status,'GAP');assert.equal(stays.view,gap);assert.equal(stays.attempts,0);
 assert.equal(stays.reason,`${gap.reason}; searched again in ${B}: no clear camera: ${cams.candidates.length} of ${cams.candidateCount} candidate positions over platforms were inspected (${cams.spreadCount} spread over the platforms, then ${cams.candidates.length-cams.spreadCount} thinned-out neighbours); blocked by Scene/furniture/benches (coach occluded) x${cams.candidates.length}`);
 assert.equal(out.report?.length,1,'the search report is returned');out.results.filter(r=>r!==stays).forEach(r=>assert.ok(results.includes(r)));
 // a GAP the plan itself gives (its spec is not OK) is no answer of the rule's, and a GAP with no placement has nowhere to be searched: both stay as recorded
 reset();const own={...plan,views:plan.views.map(s=>s.suffix===suffix?{...s,status:'GAP',reason:'the plan has no such view'}:s)};
 out=await reseat({results,station:own,search:searchWith(allAt(plan,B)),capture});assert.equal(out.results,results);assert.equal(out.report,null);assert.deepEqual(calls,{search:[],capture:[]});
 const lost=(({placement,...rest})=>rest)(gap),homeless=results.map(r=>r.view===gap?gapResult(lost):r);
 out=await reseat({results:homeless,station:plan,search:searchWith(allAt(plan,B)),capture});assert.equal(out.results,homeless);assert.equal(out.report,null);assert.deepEqual(calls,{search:[],capture:[]});
 // and one with no placement ahead of a blocked camera does not hide it: the placement searched is that of the first view that can be searched
 const camera=frozen[0],hidden=[gapResult(lost),{view:camera,status:'GAP',reason:'coach occluded',blocker:'Scene/furniture/benches',inspection:{clear:false},attempts:2},...frozen.filter(v=>v!==gap&&v!==camera).map(okResult)];
 reset();out=await reseat({results:hidden,station:plan,search:searchWith(allAt(plan,B)),capture});assert.deepEqual(calls,{search:[[B]],capture:[[camera.suffix]]});assert.equal(out.results[0],hidden[0],'the GAP with no placement is as recorded');assert.equal(out.results[1].status,'OK');assert.equal(out.results[1].view.search.replacesFrozen?.reason,'coach occluded');
 // a view of another id, one whose status is neither OK nor GAP (even if its result says GAP), and a GAP that this run's own search recorded (it is not frozen) are left alone
 reset();const other=[{view:{...gap,id:'V03'},status:'GAP',reason:gap.reason,attempts:0},{view:{...gap,status:'N/A'},status:'N/A',reason:'x',attempts:0},{view:{...gap,status:'N/A'},status:'GAP',reason:'x',attempts:0},{view:{...gap,search:{chosen:B}},status:'GAP',reason:gap.reason,attempts:0}];
 out=await reseat({results:other,station:plan,search:searchWith(allAt(plan,B)),capture});assert.equal(out.results,other);assert.equal(out.report,null);assert.deepEqual(calls,{search:[],capture:[]});
 // the planner on its own: a frozen GAP has no eye, bearing or platform to name, and takes its blocker from the view when the result carries none
 const planned=calm(()=>F.reseatBlockedStationViews(plan,[{view:gap,reason:gap.reason}],fakeReport(plan,{[B]:{...allAt(plan,B)[B],[suffix]:1}})),'reseatBlockedStationViews');
 assert.deepEqual(planned.replacements.map(v=>v.suffix),[suffix]);assert.deepEqual(planned.replacements[0].search.replacesFrozen,{eye:null,azimuthDeg:null,platform:null,reason:gap.reason,blocker:gap.blocker});
});

test('the summary of a station search lists every placement tried and, per view, how many cameras were inspected, the bearing accepted and what blocked the rest',()=>{
 const plan=stationPlans.get('lner5'),[A,B]=plan.placements.map(p=>p.id);
 const report=fakeReport(plan,{[A]:{'station-25m':null,'station-75m':1},[B]:{...allAt(plan,B)[B],'station-150m':2,'station-75m-coach':null}});
 const summary=C.stationSearchSummary(report);
 assert.deepEqual(summary.map(s=>[s.placement,s.clear]),report.map(r=>[r.placementId,r.clear]));assert.equal(summary.length,2);
 const a=summary[0].views,b=summary[1].views;
 assert.deepEqual(a['station-25m'],{tested:plan.placements[0].views[0].candidates.length,acceptedAzimuthDeg:null,failures:[['Scene/furniture/benches (coach occluded)',plan.placements[0].views[0].candidates.length]]});
 assert.deepEqual(a['station-75m'],{tested:2,acceptedAzimuthDeg:plan.placements[0].views[1].candidates[1].azimuthDeg,failures:[['Scene/furniture/benches (coach occluded)',1]]});
 assert.deepEqual(b['station-150m'],{tested:3,acceptedAzimuthDeg:plan.placements[1].views[2].candidates[2].azimuthDeg,failures:[['Scene/furniture/benches (coach occluded)',2]]});
 assert.deepEqual(b['station-25m'],{tested:1,acceptedAzimuthDeg:plan.placements[1].views[0].candidates[0].azimuthDeg,failures:[]},'a camera accepted first time has nothing that blocked it');
 assert.equal(b['station-75m-coach'].acceptedAzimuthDeg,null);assert.deepEqual(Object.keys(b),plan.views.map(v=>v.suffix),'every view, in the plan\'s order');
 assert.deepEqual(C.stationSearchSummary([]),[]);
});

test('a V10 search view is checked and chosen through the same inspection as the final picture, placement by placement',()=>{
 const f=checkFixture(),placement={id:'p1',position:[100,0,-40],rotationY:.7},spec=side(0).region;
 const at=(x,y=2.6,z=13)=>F.placedPoint(placement,[x,y,z]),target=at(0,1.7,13);
 // a screen stands between the train and the first camera, on the left; the second camera is on the right with a clear view
 const screen=new T.Mesh(new T.BoxGeometry(.3,10,80),new T.MeshBasicMaterial());screen.name='platform-screen';screen.position.set(...at(-8,5,13));screen.rotation.y=placement.rotationY;f.scene.add(screen);
 // CHANGED (V10 thinned-out neighbours): the candidates carry the pass they belong to, and the search records it for each camera it tried
 const candidates=[{azimuthDeg:270,platform:'L',eye:at(-30),near:.3,pass:'spread'},{azimuthDeg:90,platform:'R',eye:at(30),near:.3,pass:'neighbour'},{azimuthDeg:91,platform:'R',eye:at(31),near:.3,pass:'neighbour'}];
 const second={id:'p2',position:[0,0,0],rotationY:0,views:[{suffix:'v',region:spec,focusWorld:[0,1.7,13],candidates:[]}]};
 const report=F.searchStation(T,f,[{...placement,views:[{suffix:'v',region:spec,focusWorld:target,candidates}]},second]);
 assert.equal(report.length,1,'the first placement has every view clear, so the second is never tried');const r=report[0];assert.deepEqual([r.placementId,r.clear],['p1',1]);
 assert.deepEqual([r.views.v.tested,r.views.v.accepted],[2,{index:1,azimuthDeg:90}],'the first clear camera ends the view');
 assert.deepEqual(r.views.v.tried.map(t=>[t.azimuthDeg,t.platform,t.clear,t.reason]),[[270,'L',false,'coach occluded'],[90,'R',true,null]]);assert.match(r.views.v.tried[0].blocker,/platform-screen/);assert.equal(r.views.v.tried[1].blocker,null);assert.deepEqual(r.views.v.tried.map(t=>t.pass),['spread','neighbour'],'each tried camera records its pass');
 vec(f.group.position.toArray(),placement.position,1e-12);near(f.group.rotation.y,placement.rotationY,1e-12);vec(f.camera.position.toArray(),candidates[1].eye,1e-9,'the camera is left at the last candidate tried');assert.equal(f.camera.near,.3);assert.equal(f.camera.fov,50);
 // it is the very check the picture gets: the same options, so a camera the search calls clear is clear to the picture
 assert.deepEqual(F.stationCheckOptions(),{minScreenSpan:.03});
 const sameAsPicture=F.inspectCatalogueView(T,f.scene,f.camera,f.group,f.ground,{region:spec},F.stationCheckOptions());assert.equal(sameAsPicture.clear,true,JSON.stringify(sameAsPicture).slice(0,200));
 // nothing clear: every candidate is tried and recorded, and the search goes on to the next placement
 // (each view is judged on its own region: the first view's holds none of the train, the second view's is the car it looks at)
 const elsewhere={min:[-1.6,.6,100],max:[1.6,3.4,120]};
 const blocked=F.searchStation(T,f,[{...placement,views:[{suffix:'v',region:elsewhere,focusWorld:target,candidates:[candidates[0]]},{suffix:'w',region:spec,focusWorld:target,candidates:[candidates[1]]}]},{...placement,id:'p3',views:[{suffix:'v',region:spec,focusWorld:target,candidates:[]}]}]);
 assert.deepEqual(blocked.map(b=>[b.placementId,b.clear]),[['p1',1],['p3',0]],'one of two views clear is not a full placement');assert.deepEqual(blocked[1].views.v,{tested:0,accepted:null,tried:[]});
 assert.equal(blocked[0].views.v.accepted,null);assert.deepEqual(blocked[0].views.w.accepted,{index:0,azimuthDeg:90});
 // a station view may be smaller in the frame (0.03 of it) than the V01-V09 views (0.05): a 12 m region at 300 m is 0.049, at 600 m 0.024
 const distant=m=>F.searchStation(T,f,[{...placement,views:[{suffix:'v',region:spec,focusWorld:target,candidates:[{azimuthDeg:90,platform:'R',eye:at(m),near:m/100}]}]}])[0];
 const far=distant(300);assert.equal(far.clear,1,JSON.stringify(far.views.v.tried));
 assert.equal(F.inspectCatalogueView(T,f.scene,f.camera,f.group,f.ground,{region:spec}).reason,'viewed region too small in frame','the V01-V09 default refuses that same picture');
 const toofar=distant(600);assert.equal(toofar.clear,0);assert.equal(toofar.views.v.tried[0].reason,'viewed region too small in frame');
});

test('the in-page driver adds only the specimen for V10, keeps every piece of scenery, and sets cameras in world metres',()=>{
 const page=fakePage(),before=page.scene.children.slice(),plan=stationPlans.get('lner5'),B=plan.placements[1],spec=plan.specs[0];
 const eye=F.placedPoint(B,[-30,2.6,1.5]),pose={id:'V10',suffix:'station-25m',eye,target:F.placedPoint(B,[0,1.7,1.5]),fov:50,up:[0,1,0],near:.3,region:spec.region,placement:{id:B.id,position:B.position,rotationY:B.rotationY}};
 withPage(page,cat=>{
  const begun=cat.beginStation('lner5');
  // CHANGED (page chrome): see the stage test above
  assert.deepEqual(begun.hidden,[]);assert.equal(begun.stage,null);assert.deepEqual(begun.hiddenDom,page.chromeNames);assert.match(begun.scenery,/^kept/);assert.match(begun.ground,/flat fallback/);
  assert.equal(page.h1.style.display,'none');assert.ok(page.scene.children.every(o=>o.visible),'nothing is hidden');assert.equal(page.scene.children.length,before.length+1);assert.equal(page.scene.children.at(-1).name,'train-lner5');
  assert.throws(()=>cat.begin('lner5',100),/already on stage/);assert.throws(()=>cat.beginStation('lner5'),/already on stage/);
  const text="lner5 catalogue specimen at King's Cross, station scenery kept - V10 station-25m",r=cat.stationView(pose,text);
  assert.equal(r.inspection.clear,true,JSON.stringify(r.inspection).slice(0,300));near(r.pose.positionErrorM,0,1e-9);vec(r.pose.position,eye,1e-9);vec(page.camera.position.toArray(),eye,1e-9);assert.equal(page.camera.near,.3);
  vec(r.placement.position,B.position,1e-12);near(r.placement.rotationY,B.rotationY,1e-12);assert.ok(r.local,'the page reports the pose in the train frame too');vec(r.local.eye,[-30,2.6,1.5],1e-9);vec(r.local.target,[0,1.7,1.5],1e-9);assert.equal(r.labelText,text);assert.equal(page.made.get('capture-train-label').textContent,text);assert.equal(page.frames.length,1);
  const group=page.scene.getObjectByName('train-lner5');assert.equal(group.children.some(c=>c.visible),true);cat.isolate('empty');assert.equal(group.visible,false);cat.isolate('all');assert.equal(group.visible,true);
  const report=cat.stationSearch([{...B,views:[{suffix:'station-25m',region:spec.region,focusWorld:pose.target,candidates:[{azimuthDeg:270,platform:'x',eye,near:.3}]}]}]);
  assert.equal(report[0].clear,1);assert.equal(report[0].views['station-25m'].accepted.index,0);
  // the picture's own check admits a smaller subject than V01-V09 do: the cab region at 330 m is a few percent of the frame
  const distantPose={...pose,eye:F.placedPoint(B,[-330,2.6,1.5]),near:3.3},distant=cat.stationView(distantPose,'far');
  assert.equal(distant.inspection.clear,true,JSON.stringify(distant.inspection).slice(0,300));assert.ok(distant.inspection.screenSpan>=.03&&distant.inspection.screenSpan<.05,`${distant.inspection.screenSpan}`);
  assert.equal(F.inspectCatalogueView(T,page.scene,page.camera,group,cat.state.ground,distantPose).reason,'viewed region too small in frame','the V01-V09 default refuses that same picture');
  page.window.__signalFrame=()=>{page.camera.position.x+=.5;};assert.throws(()=>cat.stationView(pose,'x'),/moved the camera by 0\.5 m/);page.window.__signalFrame=t=>page.frames.push(t);
  assert.equal(cat.end(),true);
  // CHANGED (page chrome): the stylesheet gives `.hud` its flex, so with the inline style gone the display is the stylesheet's
  assert.deepEqual(page.scene.children,before,'only the specimen was added, and it is gone');assert.ok(page.scene.children.every(o=>o.visible));assert.equal(page.h1.style.display,'');assert.equal(page.hud.style.display,'');assert.equal(page.hud.shown,true);assert.equal(page.made.size,0);assert.equal(cat.state,null);
  // the stage flow still works afterwards, and a page with terrain gives the check its ground
  page.k.parts={terrain:{heightAt:()=>-.5}};const again=cat.beginStation('hull5');assert.equal(again.ground,'the page terrain');assert.equal(cat.state.ground.heightAt(0,0),-.5,'the check takes its ground from the page terrain');cat.end();
 });
});

// (the next test uses the station scene, which is loaded above)
test('an exposure pins the page to its lighting with a query appended to the base query; the day pass keeps the page\'s scenery, and the page must be lit as the pass says',()=>{
 const base='trains=none&board=0&tooltip=0&signals=0';
 assert.equal(C.CATALOGUE_URL_QUERY,base);assert.deepEqual(C.EXPOSURE_IDS,['day','dusk']);
 assert.equal(C.catalogueUrlQuery(),`${base}&sky=ref`,'the default is the day pass');assert.equal(C.catalogueUrlQuery('day'),`${base}&sky=ref`);assert.equal(C.catalogueUrlQuery('dusk'),`${base}&time=2026-11-09T16:30:00Z&weather=clear`);
 // ?bare=1 also removes the terrain, the city and the landmarks and draws a grid (web/src/main.ts), so V10 would not stand in the same station: neither pass pins it
 for(const id of C.EXPOSURE_IDS)assert.ok(!/(^|&)(bare|grid|terrain)(=|&|$)/.test(C.catalogueUrlQuery(id)),`${id}: scenery is the page as built`);
 assert.ok(!/time=|weather=/.test(C.catalogueUrlQuery('day')),'a pinned clock or weather turns the fixed rig off (main.ts fixedSky)');assert.ok(!/sky=/.test(C.catalogueUrlQuery('dusk')));
 assert.throws(()=>C.catalogueUrlQuery('noon'),/unknown exposure noon/);
 for(const inherited of ['toString','constructor','__proto__','hasOwnProperty']) {
  assert.throws(()=>C.catalogueUrlQuery(inherited),new RegExp(`unknown exposure ${inherited}`),`${inherited} is a property of every object, not an exposure`);
  assert.throws(()=>C.checkExposure(inherited,{lights:[],atmosphereState:null}),new RegExp(`unknown exposure ${inherited}`));
  assert.throws(()=>C.parseCatalogueArgs(['--mode','catalogue','--dist','d','--out','o','--exposure',inherited]),/--exposure: unknown/);
 }
 assert.deepEqual(C.exposureRecord('day'),{id:'day',urlQuery:`${base}&sky=ref`,rig:'fixed',pinnedTime:null,pinnedWeather:null});
 assert.deepEqual(C.exposureRecord('dusk'),{id:'dusk',urlQuery:`${base}&time=2026-11-09T16:30:00Z&weather=clear`,rig:'atmosphere',pinnedTime:'2026-11-09T16:30:00Z',pinnedWeather:'clear'});
 // the page must be lit as the pass says, or the run stops
 const lights=[{type:'HemisphereLight',intensity:1.25,position:[0,1,0]},{type:'DirectionalLight',intensity:1.7,position:[-320,520,260]}];
 C.checkExposure('day',{lights,atmosphereState:null});
 assert.throws(()=>C.checkExposure('day',{lights,atmosphereState:{timeMs:1}}),/the day pass needs the fixed rig, but the page has an atmosphere/);
 assert.throws(()=>C.checkExposure('day',{lights:[lights[0],{...lights[1],position:[-320,520,261]}],atmosphereState:null}),/the page sun is not at -320,520,260/);assert.throws(()=>C.checkExposure('day',{lights:[lights[0]],atmosphereState:null}),/the page sun is not at/);
 C.checkExposure('dusk',{lights:[],atmosphereState:{timeMs:Date.parse('2026-11-09T16:30:00Z')}});
 assert.throws(()=>C.checkExposure('dusk',{lights,atmosphereState:null}),/the dusk pass needs the page's atmosphere, but the page has none/);
 assert.throws(()=>C.checkExposure('dusk',{lights,atmosphereState:{timeMs:Date.parse('2026-11-09T16:31:00Z')}}),/the page clock is 2026-11-09T16:31:00\.000Z, not the pinned 2026-11-09T16:30:00Z/);
 assert.throws(()=>C.checkExposure('night',{}),/unknown exposure night/);
 // the page address and the head of the manifest carry the exposure
 assert.equal(C.cataloguePageUrl(4321,'day'),`http://127.0.0.1:4321/kings-cross/?${base}&sky=ref`);assert.equal(C.cataloguePageUrl(4321,'dusk'),`http://127.0.0.1:4321/kings-cross/?${base}&time=2026-11-09T16:30:00Z&weather=clear`);
 const host={os:{platform:'darwin'},macModel:'Mac17,6',git:{head:'h'}},head=C.catalogueManifest({exposure:'dusk',stationScene:station,host,build:{indexSha256:'x'},poses:{file:'/p.json',sha256:'abc'},generated:'2026-11-09T00:00:00.000Z'});
 assert.deepEqual(head.exposure,C.exposureRecord('dusk'));assert.deepEqual([head.rubric,head.schema,head.generated,head.posesFrom,head.kinds,head.macModel,head.build],[F.CATALOGUE.rubric,'kx-catalogue-manifest/1','2026-11-09T00:00:00.000Z',{file:'/p.json',sha256:'abc'},{},'Mac17,6',{indexSha256:'x'}]);
 assert.match(head.sunRule.text,/always uses the day rig's sun, in every exposure/);assert.deepEqual(head.sunRule.sunPosition,[-320,520,260]);assert.deepEqual(head.station,C.stationManifest(station));
 const bare=C.catalogueManifest({exposure:'day',stationScene:null,host,build:{},poses:null});assert.deepEqual([bare.station,bare.posesFrom,bare.exposure.id],[null,null,'day']);assert.equal(typeof bare.generated,'string');
});

test('a view is photographed after the page is checked for chrome, then without the specimen, and for a whole-car subject with only that car',async()=>{
 const calls=[],evaluate=async expression=>{calls.push(expression);return true;},screenshot=async()=>{calls.push('shot');return Buffer.from([calls.length]);};
 const plain=await C.photograph({evaluate,screenshot,view:{extents:null}});
 assert.deepEqual(calls,['window.__cat.assertChrome()','shot',"window.__cat.isolate('empty')",'shot',"window.__cat.isolate('all')"]);assert.deepEqual([plain.shot[0],plain.baseline[0],plain.subject],[2,4,null]);
 calls.length=0;const car=await C.photograph({evaluate,screenshot,view:{extents:{scope:'car',car:3}}});
 assert.deepEqual(calls,['window.__cat.assertChrome()','shot',"window.__cat.isolate('empty')",'shot',"window.__cat.isolate('car:3')",'shot',"window.__cat.isolate('all')"]);assert.equal(car.subject[0],6);
 calls.length=0;await C.photograph({evaluate,screenshot,view:{extents:{scope:'train'}}});assert.equal(calls.filter(c=>c==='shot').length,2,'a whole-train subject is the train, which the baseline already isolates');
 // a page with chrome on it stops the photograph before anything is taken
 let shots=0;
 await assert.rejects(C.photograph({evaluate:async expression=>{if(/assertChrome/.test(expression))throw new Error('page chrome would be in the picture: x');},screenshot:async()=>{shots++;return Buffer.alloc(0);},view:{extents:null}}),/page chrome would be in the picture/);assert.equal(shots,0);
});

// (this test uses the V10 plans, which exist only once the station scene has loaded below)
test('the in-page driver leaves only the canvas and the capture label drawn in every frame, hides what the page adds later, stops at chrome it cannot hide, and puts every inline style back',()=>{
 const plan=stationPlans.get('lner5'),B=plan.placements[1],spec=plan.specs[0],eye=F.placedPoint(B,[-30,2.6,1.5]);
 const pose={id:'V10',suffix:'station-25m',eye,target:F.placedPoint(B,[0,1.7,1.5]),fov:50,up:[0,1,0],near:.3,region:spec.region,placement:{id:B.id,position:B.position,rotationY:B.rotationY}};
 for(const station of [false,true]) {
  const page=fakePage(),length=formations.get('lner5').length;
  page.switcher.style.setProperty('display','flex');page.notice.style.setProperty('display','block','important');
  const all=el=>[el,...el.children.flatMap(all)],inline=new Map(all(page.body).map(el=>[el,[el.style.getPropertyValue('display'),el.style.getPropertyPriority('display')]]));
  // the page as it stands is covered in chrome: the check below could fail
  assert.deepEqual(page.drawnOutside().filter(n=>/^(h1|div\.hud|div#almanac-back-host|nav\.station-switcher|p\.station-notice)$/.test(n)),['h1','div.hud','div#almanac-back-host','nav.station-switcher','p.station-notice']);
  withPage(page,cat=>{
   const begun=station?cat.beginStation('lner5'):cat.begin('lner5',length);assert.deepEqual(begun.hiddenDom,page.chromeNames,station?'V10':'stage');
   const look=text=>station?cat.stationView(pose,text):cat.view(view('lner5','front-3m'),text);
   const calm=text=>{let frame;assert.doesNotThrow(()=>{frame=look(text);},`the ${text} frame is drawn`);return frame;};
   const r=calm('first');
   assert.deepEqual(page.outside,[[]],'nothing but the canvas and the capture label is drawn in the frame');assert.deepEqual(page.drawnOutside(),[]);
   // the record of what was hidden: every chrome element, whether it was drawn, where, and nothing still drawn
   assert.deepEqual(r.chrome.hidden.map(h=>h.name),page.chromeNames);assert.deepEqual(r.chrome.visible,[]);
   const byName=Object.fromEntries(r.chrome.hidden.map(h=>[h.name,h]));
   assert.deepEqual(byName.h1,{name:'h1',drawn:true,box:[1380,12,200,30]});assert.deepEqual(byName['nav.station-switcher'],{name:'nav.station-switcher',drawn:true,box:[120,8,700,34]});assert.equal(byName['div#fallback'].drawn,false);assert.equal(byName['div.mml-train-labels'].drawn,false,'a box with no area draws nothing');
   assert.ok(page.made.get('capture-train-label').shown&&page.canvas.shown&&page.app.shown,'the label, the canvas and its host stay');
   // what the page adds later is hidden before the next frame, at the top and inside the canvas host
   const toast=new FakeEl('DIV',{className:'toast',rect:[600,500,300,40]}),badge=new FakeEl('DIV',{className:'badge',rect:[10,10,50,20]});page.body.append(toast);page.app.append(badge);
   assert.deepEqual(page.drawnOutside(),['div.badge','div.toast'],'in document order: the canvas host comes first');
   const second=calm('second');assert.deepEqual(page.outside,[[],[]]);assert.deepEqual(second.chrome.hidden.slice(-2).map(h=>[h.name,h.drawn]),[['div.badge',true],['div.toast',true]]);
   // a chrome no inline style can hide (a stylesheet rule that wins) stops the capture before a frame is drawn
   const stubborn=new FakeEl('DIV',{className:'stubborn',stubborn:true,rect:[0,0,50,50]});page.body.append(stubborn);const frames=page.frames.length;
   assert.throws(()=>look('third'),/page chrome would be in the picture: div\.stubborn at 0,0,50,50/);assert.equal(page.frames.length,frames,'no frame is drawn with chrome on it');
   assert.throws(()=>cat.assertChrome(),/page chrome would be in the picture: div\.stubborn/);stubborn.remove();assert.deepEqual(cat.assertChrome().visible,[]);
   assert.equal(cat.end(),true);
  });
  for(const [el,was] of inline)assert.deepEqual([el.style.getPropertyValue('display'),el.style.getPropertyPriority('display')],was,`${nameOfEl(el)} is as the page had it`);
  assert.equal(page.made.size,0,'the label is gone');assert.ok(['h1','div.hud','nav.station-switcher'].every(n=>page.drawnOutside().includes(n)),'the chrome is back');
 }
});

test('a V10 manifest entry freezes the placement and the search, and its sidecar says how far the camera really is and what it stands on',()=>{
 const plan=stationPlans.get('lner5'),B=plan.placements[1].id,views=F.stationViewsFromSearch(plan,fakeReport(plan,{[B]:{...allAt(plan,B,1)[B],'station-75m-coach':null}})),ok=views[0],gap=views[4];
 assert.deepEqual(Object.keys(F.poseOf(ok)).sort(),['azimuthDeg','car','distanceM','extents','eye','focus','fov','frame','near','placement','platform','platformHeightM','region','rotationY','status','target','up']);
 const frozenPose=F.poseOf(ok);
 assert.deepEqual([frozenPose.frame,frozenPose.placement?.id,frozenPose.rotationY,frozenPose.distanceM,frozenPose.azimuthDeg,frozenPose.platform,frozenPose.platformHeightM],['station',B,plan.placements[1].rotationY,25,ok.azimuthDeg,ok.platform,.9]);
 assert.ok(typeof frozenPose.platform==='string'&&frozenPose.platform!=='');assert.deepEqual(frozenPose.focus,{name:'cab',local:[0,1.7,1.5],world:plan.placements[1].views[0].focusWorld});
 const entry=C.manifestEntry({view:ok,status:'OK',reason:null,file:'lner5-station-25m.png',inspection:{checkedSamples:30,visibleFraction:.5},verdict:{ok:true}});
 assert.deepEqual(entry.plan,F.poseOf(ok));assert.equal(entry.outcome.search,ok.search);assert.equal(entry.rotation.ruleId,'station-placement');assert.equal(entry.notes.sceneryKept,true);
 const gapEntry=C.manifestEntry({view:gap,status:'GAP',reason:gap.reason,attempts:0});assert.equal(gapEntry.outcome.blocker,gap.blocker);assert.equal(gapEntry.outcome.search.failures.length,1);assert.equal(gapEntry.plan.status,'GAP');assert.equal(gapEntry.plan.eye,undefined);
 assert.equal(C.manifestEntry({view:ok,status:'GAP',reason:'x',blocker:'from the run',inspection:{clear:false}}).outcome.blocker,'from the run','a blocker found at capture time wins');
 const session={renderer:'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)',size:[1600,1000],devicePixelRatio:1,toneMapping:0,toneMappingExposure:1,outputColorSpace:'srgb',background:'35465e',fog:null,lights:[]};
 const live={pose:{position:[10,2.6,-30.5],target:[10,1.7,-5],fov:50,aspect:1.6,near:.25,far:9000,up:[0,1,0],positionErrorM:1e-15},local:{eye:[-3,2.6,-25],target:[0,1.7,1.5]},placement:{position:plan.placements[1].position,rotationY:plan.placements[1].rotationY},inspection:{clear:true},labelText:'t',costs:{triangles:1,drawCalls:2},info:{calls:3,triangles:4}};
 const sidecar=C.catalogueSidecar({kind:'lner5',view:ok,file:'lner5-station-25m.png',formation:formations.get('lner5'),session,host:{os:{platform:'darwin'},macModel:'M',git:{head:'h'}},build:{indexSha256:'x'},
  state:{hidden:[],hiddenDom:['h1'],stage:null,scenery:'kept: x',ground:'the page terrain'},result:{verdict:{ok:true},live},timings:{}});
 assert.deepEqual(sidecar.view.suffix,'station-25m');vec(sidecar.pose.trainLocal.eye,[-3,2.6,-25]);vec(sidecar.pose.trainLocal.target,[0,1.7,1.5]);vec(sidecar.pose.world.position,[10,2.6,-30.5]);assert.deepEqual(sidecar.pose.trainLocal.region,ok.region);
 assert.deepEqual(sidecar.specimen.rotationRule,ok.rotation);assert.deepEqual([sidecar.hiddenSceneNames,sidecar.stage],[[],null]);
 const s=sidecar.station;assert.ok(s,'a V10 sidecar has a station block');
 assert.deepEqual([s?.placement?.id,s?.distanceM,s?.azimuthDeg,s?.platform,s?.platformHeightM,s?.scenery,s?.ground],[B,25,ok.azimuthDeg,ok.platform,.9,'kept: x','the page terrain']);near(s?.horizontalDistanceM,25.5,1e-12,"the distance the page measured, not the planned one");near(s?.eyeAbovePlatformM,1.7,1e-12);assert.equal(s?.search,ok.search);
 const stage=C.catalogueSidecar({kind:'lner5',view:view('lner5','front-3m'),file:'f.png',formation:formations.get('lner5'),session,host:{os:{}},build:{},state:{hidden:[],hiddenDom:[],stage:{}},result:{verdict:{ok:true},live:{...live,local:undefined}},timings:{}});
 assert.equal('station' in stage,false,'only V10 has a station block');vec(stage.pose.trainLocal.eye,view('lner5','front-3m').eye,1e-12,'a stage view reports the pose it was planned in');
});

test('catalogue preflight and frozen poses cover V10: the planned counts, the frozen reuse, and a refusal when a camera or placement moved',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/train-views-test-'),log=console.log;
 try {
  const dist=path.join(dir,'dist'),out=path.join(dir,'out');await mkdir(dist);
  const run=async(...args)=>{const lines=[];console.log=(...a)=>lines.push(a.join(' '));try{await C.catalogueMain(['--mode','catalogue','--dist',dist,'--out',out,'--chrome','none',...args]);}finally{console.log=log;}return lines.map(l=>JSON.parse(l));};
  const ok=async(...args)=>{try{return await run(...args);}catch(e){assert.fail(`catalogueMain threw: ${e?.message}`);}};
  const kinds=['lner5','gn387x4'],manifest=(mutate=()=>{})=>{
   const m={rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:{}};
   for(const kind of kinds){const plan=stationPlans.get(kind),B=plan.placements[1].id,views=F.stationViewsFromSearch(plan,fakeReport(plan,{[B]:{...allAt(plan,B,1)[B],'station-150m':null}}));m.kinds[kind]={views:manifestOf(views).views};}
   mutate(m);return m;};
  const poses=path.join(dir,'poses.json'),save=async m=>writeFile(poses,JSON.stringify(m));await save(manifest());
  const [frozen]=await ok('--kinds',kinds.join(','),'--views','V10','--poses',poses);assert.equal(frozen.posesFrozen,true);assert.deepEqual(frozen.planned,{lner5:{OK:5,GAP:1},gn387x4:{OK:5,GAP:1}},'a frozen GAP stays a GAP in the plan');
  const [fresh]=await ok('--kinds',kinds.join(','),'--views','V10');assert.deepEqual(fresh.planned,{lner5:{OK:6},gn387x4:{OK:6}});
  await save(manifest(m=>{m.kinds.lner5.views['station-25m'].plan.eye[0]+=.5;}));
  await assert.rejects(run('--kinds','lner5','--views','V10','--poses',poses),/refusing to capture: 1 pose\(s\) differ from .*lner5\/station-25m pose differs from the frozen pose at \/eye\/0/);
  await save(manifest(m=>{m.kinds.gn387x4.views['station-75m'].plan.placement.rotationY+=.2;}));
  await assert.rejects(run('--kinds','gn387x4','--views','V10','--poses',poses),/gn387x4\/station-75m placement differs from the frozen placement at \/placement\/rotationY/);
  await save(manifest(m=>{delete m.kinds.lner5.views['station-150m-coach'];}));
  await assert.rejects(run('--kinds','lner5','--views','V10','--poses',poses),/lner5\/station-150m-coach view missing from the frozen poses/);
  await run('--kinds','lner5','--views','V02','--poses',poses).then(()=>assert.fail('the stage views are missing from this manifest'),e=>assert.match(e.message,/lner5\/front-3m view missing from the frozen poses/));
  await save(manifest());const [only]=await ok('--kinds','lner5','--views','V10','--poses',poses);assert.equal(only.posesFrozen,true,'V01-V09 entries are not needed when only V10 is captured');
  const manifestOfRun=C.stationManifest(station);assert.deepEqual([manifestOfRun.stopIndex,manifestOfRun.stop?.id,manifestOfRun.orientations,manifestOfRun.platformHeightM,manifestOfRun.eyeAbovePlatformM,manifestOfRun.noseToStopM],[3,station.stops[3].id,F.STATION_ORIENTATIONS,.9,1.7,1.5]);
  // CHANGED (V10 thinned-out neighbours): the manifest's search block names the two passes
  assert.deepEqual(manifestOfRun.search,{azimuthStepDeg:1,maxCandidates:48,minSeparationDeg:2,edgeClearM:.5,frontAngleDeg:45,minScreenSpan:.03,passes:['spread','neighbour']});assert.equal(manifestOfRun.trackData.sha256,station.sha256);assert.match(manifestOfRun.rule,/nose at the buffers first/);assert.deepEqual(manifestOfRun.platforms.slice(0,3),station.platforms.slice(0,3).map(p=>p.ref));
 } finally {console.log=log;await rm(dir,{recursive:true,force:true});}
});

test('a camera inside an inside-out shell such as the sky dome is where it belongs, and V10 puts no specimen stage under the train',()=>{
 // (the mesh the check names is compared by name: a failing assertion must not try to print a 500 m sphere)
 const shell=(name,material,geometry=new T.SphereGeometry(500,16,12))=>{const m=new T.Mesh(geometry,material);m.name=name;m.updateMatrixWorld(true);return m;};
 const enclosing=mesh=>F.cameraInsideMesh(T,new T.Vector3(0,2.6,0),[mesh])?.name??null;
 assert.equal(enclosing(shell('sky-dome',new T.MeshBasicMaterial({side:T.BackSide}))),null,'the sky dome does not enclose the camera');
 assert.equal(enclosing(shell('closed-shell',new T.MeshBasicMaterial())),'closed-shell','the same shell, facing outward, is a solid the camera is inside');
 const halves=new T.SphereGeometry(500,16,12),half=Math.floor(halves.index.count/6)*3;halves.addGroup(0,half,0);halves.addGroup(half,halves.index.count-half,1);
 assert.equal(enclosing(shell('half-dome',[new T.MeshBasicMaterial({side:T.BackSide}),new T.MeshBasicMaterial()],halves)),'half-dome','only a mesh whose every material is inside-out is exempt');
 const group=new T.Group();F.placeStageSpecimen(group,null,1.2,[3,0,-4]);vec(group.position.toArray(),[3,0,-4]);near(group.rotation.y,1.2);
});

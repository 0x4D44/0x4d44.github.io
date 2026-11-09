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
import {ALL_KINDS,trainLayout} from '../../core/train.ts';
import {PLATFORM_HEIGHT} from '../../core/scene.ts';
import {pointInPolygon} from '../../core/station.ts';
import {buildTrain,bodySpec,carPlan} from '../../web/src/train.ts';
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
 for(const kind of AT300)assert.equal(any(kind,'bogie-trailer').status,'GAP');
 for(const kind of ALL_KINDS.filter(k=>!AT300.includes(k)))assert.equal(any(kind,'bogie-trailer').status,'OK');
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

test('V09 uses the V02 pose in the leading and trailing lamp states and is a functional GAP while the page has no lamp switch',()=>{
 for(const kind of ALL_KINDS) {
  const front=view(kind,'front-3m');
  for(const state of ['leading','trailing']) {
   const v=view(kind,`lights-${state}`);vec(v.eye,front.eye,1e-9);vec(v.target,front.target,1e-9);assert.equal(v.fov,front.fov);
   assert.equal(v.capability?.function,'setTrainLampState');assert.equal(v.capability?.state,state);assert.match(v.capability?.reason,/no window\.__kx\.setTrainLampState/);
  }
 }
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
   const pose=F.stationPose({candidate:c,focus:[0,1.7,0],distanceM:distance});near(pose.eye[1],PLATFORM_HEIGHT+1.7,1e-12);near(pose.horizontalDistanceM,distance,1e-6);assert.equal(pose.fov,50);assert.equal(pose.near,.5);
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
 const defaults=parse([]);assert.deepEqual(defaults.kinds,ALL_KINDS);assert.deepEqual(defaults.views,F.VIEW_IDS);assert.equal(defaults.chrome,null);assert.equal(defaults.poses,null);assert.equal(defaults.timeoutMs,1800000);assert.equal(defaults.dist,'d');assert.equal(defaults.out,'o');
 const picked=parse(['--kinds','tl700x8,lner5','--views','V04,V01','--chrome','none','--poses','m.json','--timeout-seconds','90']);
 assert.deepEqual(picked.kinds,['lner5','tl700x8'],'catalogue order, not argv order');assert.deepEqual(picked.views,['V01','V04']);assert.equal(picked.chrome,'none');assert.equal(picked.poses,'m.json');assert.equal(picked.timeoutMs,90000);
 assert.equal(parse(['--timeout-seconds','3600']).timeoutMs,3600000);
 for(const [extra,message] of [[['--kinds','lner5,nope'],/--kinds: unknown nope/],[['--kinds','lner5,,hull5'],/unknown \(empty\)/],[['--kinds','lner5,lner5'],/lner5 repeated/],[['--views','V11'],/--views: unknown V11/],[['--views','v01'],/unknown v01/],
   [['--bogus','1'],/unknown catalogue option --bogus/],[['--kinds','lner5','--kinds','hull5'],/repeated catalogue option --kinds/],[['--kinds'],/missing value for --kinds/],[['--kinds','--views','V01'],/missing value for --kinds/],
   [['--timeout-seconds','0'],/positive and at most 3600/],[['--timeout-seconds','-5'],/positive/],[['--timeout-seconds','abc'],/positive/],[['--timeout-seconds','3601'],/at most 3600/],[['--chrome',''],/missing value for --chrome/]])
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
  const [plain]=await run('--kinds','gn387x8,lner5','--views','V01,V08');
  assert.deepEqual([plain.catalogue,plain.rubric,plain.kinds,plain.views,plain.posesFrozen],[true,F.CATALOGUE.rubric,['lner5','gn387x8'],['V01','V08'],false]);
  assert.deepEqual(plain.planned,{lner5:{OK:7,'N/A':4},gn387x8:{OK:9,'N/A':2}});
  const [v10only]=await run('--kinds','lner5','--views','V10');assert.deepEqual(v10only.planned,{lner5:{}},'station views are planned in the page, not by the stage planner');
  const poses=path.join(dir,'manifest.json');await writeFile(poses,JSON.stringify(frozenManifest(['lner5','gn387x8'])));
  const [frozen]=await run('--kinds','lner5,gn387x8','--views','V01,V08','--poses',poses);assert.equal(frozen.posesFrozen,true);assert.deepEqual(frozen.planned,plain.planned);
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
});

// ---- the in-page driver, against a stand-in for the page ---------------------------------------------------------------------------------------
function fakePage() {
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1.6,.5,9000),controls={target:new T.Vector3(),update(){}},frames=[],sun=new T.DirectionalLight(0xffe8c2,1.7),hemi=new T.HemisphereLight();
 sun.position.set(-320,520,260);
 const shed=Object.assign(new T.Group(),{name:'train-shed'}),terrain=Object.assign(new T.Group(),{name:'terrain'}),sky=new T.Mesh(new T.PlaneGeometry(10,10),new T.MeshBasicMaterial());
 scene.add(hemi,sun,shed,terrain,sky);
 // the livery paints on a canvas only where there is a document; the stand-in page has none that can, so the train is built as it is in the other tests
 const build=kind=>{const saved=globalThis.document;delete globalThis.document;try{return buildTrain(kind);}finally{globalThis.document=saved;}};
 const k={scene,camera,controls,renderer:{info:{render:{calls:7,triangles:1234}}},evidenceBuildTrain:build};
 const h1={tagName:'H1',className:'',style:{display:''}},hud={tagName:'DIV',className:'hud',style:{display:'flex'}},made=new Map();
 const document={getElementById:id=>made.get(id)??null,createElement:()=>({style:{},textContent:'',id:'',remove(){made.delete(this.id);}}),querySelectorAll:()=>[h1,hud],body:{append:e=>made.set(e.id,e)}};
 const window={__kx:k,__cat:{T,F},__signalFrame:t=>frames.push(t)};
 return {k,window,document,frames,h1,hud,made,shed,terrain,sky,sun,hemi,scene,camera};
}
function withPage(page,work) {
 Object.assign(globalThis,{window:page.window,document:page.document});
 try { C.catalogueDriver(); return work(page.window.__cat); } finally { delete globalThis.window; delete globalThis.document; }
}

test('the in-page driver puts the specimen on the neutral stage, hides what the stage excludes, and puts everything back',()=>{
 const page=fakePage(),before=page.scene.children.slice(),length=formations.get('lner5').length;
 withPage(page,cat=>{
  const begun=cat.begin('lner5',length);
  assert.deepEqual(begun.hidden,[{name:'train-shed',type:'Group'},{name:'terrain',type:'Group'},{name:'',type:'Mesh'}]);assert.deepEqual(begun.hiddenDom,['h1','div.hud']);
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
  assert.deepEqual(page.scene.children,before);assert.ok(page.scene.children.every(o=>o.visible));assert.equal(page.h1.style.display,'');assert.equal(page.hud.style.display,'flex');vec(page.camera.up.toArray(),[0,1,0],1e-12);
  assert.equal(page.made.size,0,'the label comes off the page');
  assert.equal(cat.state,null);assert.equal(cat.end(),false);
  cat.begin('hull5',formations.get('hull5').length);assert.equal(page.scene.children.at(-1).name,'train-hull5');cat.end();
 });
});

test('the in-page driver stops at a page that moves the camera, and at a lamp view when the page has no lamp switch',()=>{
 const page=fakePage(),v=view('lner5','front-3m'),lamp=view('lner5','lights-leading');
 withPage(page,cat=>{
  cat.begin('lner5',formations.get('lner5').length);
  assert.throws(()=>cat.view(lamp,'x'),/page lost setTrainLampState/);
  const states=[];page.k.setTrainLampState=(group,state)=>states.push([group.name,state]);cat.view(lamp,'x');assert.deepEqual(states,[['train-lner5','leading']]);
  page.window.__signalFrame=()=>{page.camera.position.x+=.5;};assert.throws(()=>cat.view(v,'x'),/moved the camera by 0\.5 m/);
 });
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
 const gap=F.poseOf(any('lner5','bogie-trailer'));assert.deepEqual([gap.status,gap.eye,gap.rotationY],['GAP',undefined,undefined]);
 assert.equal(F.poseDifference(p,JSON.parse(JSON.stringify(p))),null);assert.equal(F.poseDifference({a:[1,2]},{a:[1,2.00001]}),'/a/1');assert.equal(F.poseDifference({a:[1,2]},{a:[1,2.00001]},1e-3),null);assert.equal(F.poseDifference({a:[1,2]},{a:[1,2.0000001]}),null);
 assert.equal(F.poseDifference({a:1},{a:'1'}),'/a');assert.equal(F.poseDifference({a:null},{a:undefined}),'/a');assert.equal(F.poseDifference({a:[1]},{a:{0:1}}),'/a');assert.equal(F.poseDifference({a:1,b:2},{a:1}),'/b');
});

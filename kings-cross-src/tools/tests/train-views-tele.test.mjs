// T01, the opt-in NON-SCORING long-lens nose view: a camera about 13 degrees off the train's axis that matches two AT300 reference photographs
// (lner-801-214-2025, hull-802-paragon-2025), so they can be compared like-angle. It is never taken unless `--views` names it, so the default
// run, its plan and its manifest stay as they were. No Chrome and no GPU.
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as T from 'three';
import {ALL_KINDS} from '../../core/train.ts';
import {SERVICE_LAMPS,buildTrain} from '../../web/src/train.ts';
import * as F from '../train-framing.mjs';
import * as C from '../train-capture.mjs';

const D2R=Math.PI/180,AT300=['lner5','lner9','hull5','lumo5'];
const near=(a,b,tol=1e-6,note='')=>assert.ok(Math.abs(a-b)<=tol,`${note} ${a} is not ${b}`);
const vec=(a,b,tol=1e-6,note='')=>{assert.equal(a.length,b.length,note);a.forEach((v,i)=>near(v,b[i],tol,`${note}[${i}]`));};
const parse=extra=>C.parseCatalogueArgs(['--mode','catalogue','--dist','d','--out','o',...extra]);
const tele=kind=>F.planTeleViews(C.describeFormation(kind));
const SUFFIXES=['nose-tele-left','nose-tele-right','rear-nose-tele-left','rear-nose-tele-right'];

test('T01 is opt-in: the default views stay V01-V10 and T01 is taken only when --views names it, at day only',()=>{
 assert.deepEqual(F.VIEW_IDS,['V01','V02','V03','V04','V05','V06','V07','V08','V09','V10'],'the scoring views are unchanged');
 assert.ok(!F.VIEW_IDS.includes('T01'));assert.ok(F.OPT_IN_VIEW_IDS.includes('T01'));assert.ok(F.ASKABLE_VIEW_IDS.includes('T01'));
 assert.deepEqual(parse([]).views,F.VIEW_IDS);assert.ok(!parse([]).views.includes('T01'),'no T01 without --views');
 assert.deepEqual(parse(['--views','T01']).views,['T01']);assert.deepEqual(parse(['--views','T01,V01']).views,['V01','T01']);assert.deepEqual(parse(['--views','T01,M01,V10']).views,['V10','M01','T01']);
 assert.deepEqual(parse(['--views','T01','--kinds','lner5,lner9,hull5,lumo5']).kinds,AT300);
 assert.throws(()=>parse(['--views','T01','--exposure','dusk']),/--views T01: the non-scoring nose-tele view is taken at day only/);
 assert.throws(()=>parse(['--views','T01','--exposure','noon']),/the noon pass takes the station view V10 only/);
 assert.throws(()=>parse(['--views','T02']),/--views: unknown T02; expected V01,V02,V03,V04,V05,V06,V07,V08,V09,V10,M01,C01,C02,T01/);
});

test('T01 poses are frozen numbers: 13 degrees off the axis, 61 m out, at platform eye height, both sides and both ends',()=>{
 assert.deepEqual([F.TELE.id,F.TELE.scoring,F.TELE.eye,F.TELE.targetZ,F.TELE.fov],['T01',false,[13.7,2.6,-59.4],25,8.5]);
 near(F.TELE.eye[1],F.CATALOGUE.platformHeightM+F.CATALOGUE.eyeAbovePlatformM,1e-9,'eye height is a platform eye');
 for(const kind of [...AT300,'gn387x8','gc180x5']) {
  const f=C.describeFormation(kind),L=f.length,views=tele(kind),by=Object.fromEntries(views.map(v=>[v.suffix,v]));
  assert.deepEqual(views.map(v=>v.suffix),SUFFIXES,kind);
  for(const v of views){assert.deepEqual([v.id,v.status,v.reason,v.scoring,v.fov,v.up],['T01','OK',null,false,8.5,[0,1,0]],`${kind}/${v.suffix}`);assert.equal(v.notes.scoring,false);assert.match(v.notes.purpose,/NON-SCORING/);}
  vec(by['nose-tele-right'].eye,[13.7,2.6,-59.4],1e-9,`${kind} right eye`);vec(by['nose-tele-right'].target,[0,2.6,25],1e-9);
  vec(by['nose-tele-left'].eye,[-13.7,2.6,-59.4],1e-9,`${kind} left eye`);vec(by['nose-tele-left'].target,[0,2.6,25],1e-9);
  // the photographs' side: the camera stands on the train's right (+x) for nose-tele-right, its left for nose-tele-left
  assert.ok(by['nose-tele-right'].eye[0]>0&&by['nose-tele-left'].eye[0]<0);
  // bearing off the axis from the nose: 10-15 degrees (the photographs measured 10.9 and 15.1), not V01's ~42
  for(const v of views.filter(x=>x.frame==='front')){const b=Math.atan2(Math.abs(v.eye[0]),-v.eye[2])/D2R;near(b,12.988,.001,`${kind}/${v.suffix} bearing`);assert.ok(b>=10&&b<=15);near(Math.hypot(v.eye[0],v.eye[2]),60.96,.01);}
  // the rear ends reverse the train frame exactly as V01's rear views do
  for(const side of ['left','right']){const fr=by[`nose-tele-${side}`],re=by[`rear-nose-tele-${side}`];assert.equal(re.frame,'rear');
   vec(re.eye,F.reverseFrame(fr.eye,L),1e-9,`${kind} rear ${side}`);vec(re.target,F.reverseFrame(fr.target,L),1e-9);
   const b=Math.atan2(Math.abs(re.eye[0]),re.eye[2]-L)/D2R;near(b,12.988,.001,`${kind} rear bearing`);assert.equal(re.car.index,f.cars.length-1);}
  assert.equal(by['nose-tele-right'].car.index,0);vec(by['nose-tele-right'].region.max,[1.6,3.6,f.cars[0].length],1e-6,'the front cab car is the checked region');
  assert.equal(by['rear-nose-tele-right'].region.min[2],F.reverseFrame([0,0,f.cars.at(-1).length],L)[2],'the rear cab car is the checked region');
  // and V01 is exactly as it was
  const v01=F.planCatalogueViews(f).find(x=>x.suffix==='nose-34-right');vec(v01.eye,[4.5,1.7,-5],1e-9);assert.equal(v01.fov,50);assert.equal('scoring' in v01,false);
 }
});

test('every T01 view of the four AT300 kinds is clear on the neutral stage, the whole cab car in frame and the nose three quarters across',()=>{
 for(const kind of AT300) {
  const group=buildTrain(kind),scene=new T.Scene(),stage=F.buildCatalogueStage(T,{length:C.describeFormation(kind).length});scene.add(stage,group);
  const camera=new T.PerspectiveCamera(50,1.6,.03,9000),controls={target:new T.Vector3(),update(){}},ground={heightAt:()=>F.CATALOGUE.groundY};
  for(const v of tele(kind)) {
   F.placeStageSpecimen(group,stage,v.rotation.rotationY);const pose=F.setCatalogueView(T,camera,controls,group,v),r=F.inspectCatalogueView(T,scene,camera,group,ground,v);
   assert.equal(r.clear,true,`${kind}/${v.suffix}: ${JSON.stringify(r).slice(0,300)}`);near(pose.positionErrorM,0,1e-9);
   const nose=group.localToWorld(new T.Vector3(...(v.frame==='rear'?F.reverseFrame([0,1.7,0],C.describeFormation(kind).length):[0,1.7,0]))).project(camera);
   const right=v.suffix.endsWith('right');assert.ok(right?nose.x>.35&&nose.x<.75:nose.x<-.35&&nose.x>-.75,`${kind}/${v.suffix} nose at ndc ${nose.x}`);
  }
 }
});

test('T01 is marked non-scoring in its manifest entry, sidecar view and manifest head; V01 entries and a run without T01 are unchanged',()=>{
 const t=tele('lner5')[1],v01=F.planCatalogueViews(C.describeFormation('lner5'))[1];
 const e=C.manifestEntry({view:t,status:'GAP',reason:'r'});assert.equal(e.scoring,false);assert.deepEqual(e.plan,F.poseOf(t));assert.equal(e.notes.scoring,false);
 assert.equal('scoring' in C.manifestEntry({view:v01,status:'GAP',reason:'r'}),false,'a V01 entry has no scoring key, so its bytes are as before');
 const head=(tele)=>C.catalogueManifest({exposure:'day',stationScene:null,host:{os:'h',macModel:null,git:null},build:'b',poses:null,tele,generated:'g'});
 assert.equal('tele' in head(false),false,'no tele block unless T01 is asked for');assert.deepEqual(JSON.stringify(head(undefined)),JSON.stringify(head(false)));
 const block=head(true).tele;assert.deepEqual([block.id,block.scoring,block.suffixes],['T01',false,SUFFIXES]);assert.match(block.note,/NON-SCORING/);
 assert.deepEqual(block.pose,{eye:[13.7,2.6,-59.4],target:[0,2.6,25],fov:8.5,frame:'right side of the front cab; the left mirrors x, the rear reverses the train frame'});
 assert.deepEqual(block.references.map(r=>[r.photo,r.side]),[['refs/lner/lner-801-214-2025.jpg','right'],['refs/hull/hull-802-paragon-2025.jpg','right']]);
 const sidecar=view=>C.catalogueSidecar({kind:'lner5',view,file:'f.png',formation:C.describeFormation('lner5'),session:{size:[1600,1000]},host:{os:'h'},build:'b',state:{},
  result:{verdict:{},live:{pose:{},placement:{}}},timings:{}});
 assert.equal(sidecar(t).view.scoring,false);assert.equal('scoring' in sidecar(v01).view,false);vec(sidecar(t).pose.trainLocal.eye,t.eye,1e-9);
});

test('T01 plans with --chrome none, adds nothing to a run that does not ask for it, and a frozen manifest from before it does not refuse it',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/train-views-tele-test-'),log=console.log;
 try {
  const dist=path.join(dir,'dist'),out=path.join(dir,'out');await mkdir(dist);
  const run=async(...args)=>{const lines=[];console.log=(...a)=>lines.push(a.join(' '));try{await C.catalogueMain(['--mode','catalogue','--dist',dist,'--out',out,'--chrome','none',...args]);}finally{console.log=log;}return lines.map(l=>JSON.parse(l));};
  const ok=async(...args)=>{try{return await run(...args);}catch(e){assert.fail(`catalogueMain threw: ${e?.message}`);}};
  const [only]=await ok('--views','T01','--kinds','lner5,lner9,hull5,lumo5');
  assert.deepEqual([only.catalogue,only.kinds,only.views,only.posesFrozen,only.exposure],[true,AT300,['T01'],false,'day']);assert.deepEqual(only.planned,Object.fromEntries(AT300.map(k=>[k,{OK:4}])));
  const [all]=await ok('--views','T01');assert.deepEqual(all.planned,Object.fromEntries(ALL_KINDS.map(k=>[k,{OK:4}])),'every King\'s Cross kind plans its four T01 views');
  const [dflt]=await ok('--kinds','lner5');assert.deepEqual(dflt.views,F.VIEW_IDS);
  const [v01]=await ok('--kinds','lner5','--views','V01'),[both]=await ok('--kinds','lner5','--views','V01,T01');
  assert.deepEqual(v01.planned,{lner5:{OK:4}});assert.deepEqual(both.planned,{lner5:{OK:8}},'T01 adds its four views to V01\'s');
  // a held manifest of V01 only (a pass from before T01): V01 is checked against it, T01 has nothing to drift from
  const f=C.describeFormation('lner5'),held=views=>({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:{lner5:{views:Object.fromEntries(views.map(v=>[v.suffix,{plan:JSON.parse(JSON.stringify(F.poseOf(v)))}]))}}});
  const poses=path.join(dir,'manifest.json');await writeFile(poses,JSON.stringify(held(F.planCatalogueViews(f).filter(v=>v.id==='V01'))));
  const [frozen]=await ok('--kinds','lner5','--views','V01,T01','--poses',poses);assert.deepEqual([frozen.posesFrozen,frozen.planned],[true,{lner5:{OK:8}}]);
  // a held T01 pose is held to: a moved one refuses
  const moved=held(tele('lner5'));moved.kinds.lner5.views['nose-tele-left'].plan.fov=9;await writeFile(poses,JSON.stringify(moved));
  await assert.rejects(run('--kinds','lner5','--views','T01','--poses',poses),/refusing to capture: 1 pose\(s\) differ from .*lner5\/nose-tele-left pose differs from the frozen pose at \/fov/);
  await assert.rejects(run('--kinds','lner5','--views','T01','--exposure','dusk','--poses',poses),/--views T01: the non-scoring nose-tele view is taken at day only/);
 } finally {console.log=log;await rm(dir,{recursive:true,force:true});}
});

/** The in-page driver against a bare stand-in: cat.view as the capture calls it, recording every setTrainLampState. */
function driverPage() {
 const calls=[],group={name:'train',position:{toArray:()=>[0,0,0]},rotation:{y:0},traverse(){},userData:{lampState:{...SERVICE_LAMPS}}},el={id:'',style:{},textContent:''};
 const k={camera:{position:{toArray:()=>[0,0,0]}},controls:{target:{toArray:()=>[0,0,0]}},renderer:{info:{render:{calls:0,triangles:0}}},atmosphere:null,
  setTrainLampState:(g,state)=>{calls.push({...state});g.userData.lampState={...state};}};
 const Fs={...F,placeStageSpecimen(){},setCatalogueView:()=>({position:[0,0,0],target:[0,0,0]}),inspectCatalogueView:()=>({clear:true}),trainCosts:()=>({})};
 const window={__kx:k,__cat:{T,F:Fs},__signalFrame(){}},document={getElementById:()=>el,createElement:()=>el,body:{append(){}}};
 Object.assign(globalThis,{window,document});
 try {C.catalogueDriver();} finally {delete globalThis.window;delete globalThis.document;}
 const cat=window.__cat;cat.assertChrome=()=>({hidden:[],visible:[]});cat.state={group,stage:null};
 const view=v=>{Object.assign(globalThis,{window,document});try{return cat.view(v,'label');}finally{delete globalThis.window;delete globalThis.document;}};
 return {calls,group,view};
}

test('T01 is taken in the lamps V01 is taken in (a fresh specimen\'s), even after V09 leaves the trailing state on the specimen; no other view sets lamps',()=>{
 // the state V01 is taken in is the one a specimen is built in: V01 is the first view on a fresh specimen and nothing before V09 calls setTrainLampState
 assert.deepEqual(F.LAMP_STATES.leading,SERVICE_LAMPS);
 for(const kind of AT300)assert.deepEqual(buildTrain(kind).userData.lampState,SERVICE_LAMPS,`${kind} is built in its service lamps`);
 for(const v of tele('lner5')){assert.deepEqual(v.lamps,{front:'head',rear:'tail'},v.suffix);assert.deepEqual(v.notes.lamps,{front:'head',rear:'tail'});}
 const plan=F.planCatalogueViews(C.describeFormation('lner5'));for(const v of plan)assert.equal('lamps' in v,false,`${v.suffix} has no lamps of its own`);
 const page=driverPage(),byId=s=>plan.find(v=>v.suffix===s);
 const v01=page.view(byId('nose-34-right'));assert.equal(v01.lampState,null);assert.deepEqual(page.calls,[],'V01 sets no lamps');
 const trailing=page.view(byId('lights-trailing'));assert.deepEqual(trailing.lampState,{front:'tail',rear:'head'});assert.deepEqual(page.group.userData.lampState,{front:'tail',rear:'head'});
 const v02=page.view(byId('front-3m'));assert.equal(v02.lampState,null,'a non-T01 view still leaves the state as it is');assert.equal(page.calls.length,1);
 for(const t of tele('lner5')){const r=page.view(t);assert.deepEqual(r.lampState,{front:'head',rear:'tail'},`${t.suffix} records its lamps for the sidecar`);assert.deepEqual(page.group.userData.lampState,SERVICE_LAMPS,t.suffix);}
 assert.deepEqual(page.calls.slice(1),Array(4).fill({front:'head',rear:'tail'}),'one call per T01 view, the service lamps');
 const sidecar=C.catalogueSidecar({kind:'lner5',view:tele('lner5')[0],file:'f.png',formation:C.describeFormation('lner5'),session:{size:[1600,1000],lampApi:true},host:{os:'h'},build:'b',state:{},
  result:{verdict:{},live:{pose:{},placement:{},lampState:{front:'head',rear:'tail'}}},timings:{}});
 assert.deepEqual(sidecar.renderState.lampState,{front:'head',rear:'tail'});
});

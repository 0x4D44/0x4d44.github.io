// C01, the curve (rubric-FROZEN-v1, opt-in), against a stand-in for the page: the in-page driver (a curved stage, the cars posed as the live trains are, read back), the run of one
// kind's curve with its two pictures, sidecars and report, a curve that cannot be vouched for, a finding that is not a failed picture, the manifest, argv and the frozen plans. No
// Chrome and no GPU: the real pictures are looked at by hand. (train-curve.test.mjs has the geometry.)
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as T from 'three';
import {ALL_KINDS} from '../../core/train.ts';
import {buildTrain} from '../../web/src/train.ts';
import {readPng} from '../axis01-pixels.mjs';
import * as F from '../train-framing.mjs';
import * as C from '../train-capture.mjs';

/** Every test of this file is declared with `check`: an error thrown by the code under test is a failed assertion about it, whatever the error is. */
const check=(name,body)=>test(name,async t=>{try{await body(t);}catch(error){if(error instanceof assert.AssertionError)throw error;throw new assert.AssertionError({message:`${name}: threw ${error?.stack??error}`,operator:'check'});}});
const near=(a,b,tol=1e-6,note='')=>assert.ok(Math.abs(a-b)<=tol,`${note} ${a} is not ${b} (within ${tol})`);
const vec=(a,b,tol=1e-6,note='')=>{assert.equal(a.length,b.length,note);a.forEach((v,i)=>near(v,b[i],tol,`${note}[${i}]`));};
/** A call that must not throw: a mutated function that crashes fails an assertion in the test that called it, not the run of the file. */
const safely=work=>{let out;assert.doesNotThrow(()=>{out=work();});return out;};
const KIND='gn387x4',FINDINGS_KIND='lner5';
const formations=new Map(ALL_KINDS.map(kind=>[kind,C.describeFormation(kind)]));
/** The page's own track and the route found on it, read once: the curve every plan here is made on. */
let routeOnce=null;
const route=()=>routeOnce??(routeOnce=C.loadCurveRoute());
const planOf=async kind=>{const curve=await route(),plan=safely(()=>C.planCurveFor(formations.get(kind),curve));assert.equal(plan.status,'OK',`the curve of ${kind} is OK: ${plan.reason}`);return plan;};
/** The same on the bend nearest the radius that is typical of the page's own track (C02). */
let normalOnce=null;
const normalRoute=()=>normalOnce??(normalOnce=C.loadCurveRoute(undefined,{typical:true}));
const planNormalOf=async kind=>{const curve=await normalRoute(),plan=safely(()=>C.planCurveFor(formations.get(kind),curve,undefined,F.CURVE_NORMAL));assert.equal(plan.status,'OK',`the typical curve of ${kind} is OK: ${plan.reason}`);return plan;};

// ---- a stand-in for the page ---------------------------------------------------------------------------------------------------------------
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
 constructor(tagName,{id='',className='',display='block',rect=[0,0,200,24]}={}) {Object.assign(this,{tagName,id,className,display,rect,parent:null,children:[],style:new FakeStyle(),textContent:'',visibility:'visible',opacity:'1'});}
 append(...kids) {for(const kid of kids){kid.parent=this;this.children.push(kid);}return this;}
 remove() {if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 contains(other) {for(let p=other;p;p=p.parent)if(p===this)return true;return false;}
 get shown() {for(let p=this;p;p=p.parent)if((p.style.getPropertyValue('display')||p.display)==='none')return false;return true;}
 getClientRects() {if(!this.shown)return [];const [x,y,width,height]=this.rect;return [{x,y,width,height,left:x,top:y,right:x+width,bottom:y+height}];}
 getBoundingClientRect() {const [x,y,width,height]=this.shown?this.rect:[0,0,0,0];return {x,y,width,height,left:x,top:y,right:x+width,bottom:y+height};}
}
/** The page as the curve needs it: a scene with a shed, a terrain and the lights, a camera, the chrome around a canvas, and a frame that updates the matrices. `decorate` may change the train the page builds. */
function curvePage({decorate=g=>g}={}) {
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1.6,.5,9000),controls={target:new T.Vector3(),update(){}},frames=[];
 const sun=new T.DirectionalLight(0xffe8c2,1.7),hemi=new T.HemisphereLight(),shed=Object.assign(new T.Group(),{name:'train-shed'}),terrain=Object.assign(new T.Group(),{name:'terrain'});
 sun.position.set(-320,520,260);scene.add(hemi,sun,shed,terrain);
 const body=new FakeEl('BODY'),app=new FakeEl('DIV',{id:'app',rect:[0,0,1600,1000]}),canvas=new FakeEl('CANVAS',{rect:[0,0,1600,1000]});app.append(canvas);
 const h1=new FakeEl('H1',{rect:[1380,12,200,30]}),hud=new FakeEl('DIV',{className:'hud',display:'flex',rect:[16,960,1568,28]}),almanac=new FakeEl('DIV',{id:'almanac-back-host',rect:[0,0,109,41]});
 body.append(app,h1,hud,almanac);
 const find=(el,id)=>{for(const c of el.children){if(c.id===id)return c;const f=find(c,id);if(f)return f;}return null;};
 const document={body,getElementById:id=>find(body,id),createElement:tag=>new FakeEl(tag.toUpperCase())};
 const info={autoReset:true,render:{calls:0,triangles:0,frame:0},reset(){this.render.calls=0;this.render.triangles=0;}};
 // the livery paints on a canvas only where there is a document; the stand-in page has none that can, so the train is built as it is in the other tests
 const build=kind=>{const saved=globalThis.document;delete globalThis.document;try{return decorate(buildTrain(kind),kind);}finally{globalThis.document=saved;}};
 const k={scene,camera,controls,renderer:{info,domElement:canvas},evidenceBuildTrain:build,atmosphere:null};
 const window={__kx:k,__cat:{T,F},__signalFrame:t=>{frames.push(t);scene.updateMatrixWorld();camera.updateMatrixWorld();info.render.frame++;},innerWidth:1600,innerHeight:1000,
  getComputedStyle:el=>({visibility:el.visibility,opacity:el.opacity,display:el.shown?el.display:'none'})};
 return {k,window,document,scene,camera,controls,frames,info,body,app,canvas,h1,hud,almanac,shed,terrain,chromeNames:['h1','div.hud','div#almanac-back-host'],label:()=>document.getElementById('capture-train-label')};
}
async function withPage(page,work) {
 Object.assign(globalThis,{window:page.window,document:page.document});
 try {C.catalogueDriver();return await work(page.window.__cat);} finally {delete globalThis.window;delete globalThis.document;}
}
const PNG_W=400,PNG_H=250,BACKGROUND=[60,70,80],TRAIN=[200,40,30];
/**
 * The picture of the stand-in page: a 400 x 250 grey-blue field and, where the train is shown, the rectangle that holds every vertex of it as the camera projects them. `blank(label)`
 * says for a picture whose label it is that the train is drawn nowhere in it.
 */
const screenshotOf=(page,kind,{blank=()=>false}={})=>async()=>{
 const group=page.scene.children.find(o=>o.name===`train-${kind}`),pixels=Buffer.alloc(PNG_W*PNG_H*3);
 for(let i=0;i<PNG_W*PNG_H;i++)pixels.set(BACKGROUND,i*3);
 if(group&&group.visible&&!blank(page.label()?.textContent??'')) {
  page.camera.updateMatrixWorld(true);group.updateWorldMatrix(true,true);
  const v=new T.Vector3();let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  group.traverseVisible(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(page.camera);x0=Math.min(x0,v.x);x1=Math.max(x1,v.x);y0=Math.min(y0,v.y);y1=Math.max(y1,v.y);}});
  const px=n=>Math.min(PNG_W-1,Math.max(0,Math.round((n+1)/2*PNG_W))),py=n=>Math.min(PNG_H-1,Math.max(0,Math.round((1-n)/2*PNG_H)));
  for(let y=py(y1);y<=py(y0);y++)for(let x=px(x0);x<=px(x1);x++)pixels.set(TRAIN,(y*PNG_W+x)*3);
 }
 return C.encodePng({width:PNG_W,height:PNG_H,channels:3,pixels});
};
const session={renderer:'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)',size:[1600,1000],devicePixelRatio:1,toneMapping:0,toneMappingExposure:1,outputColorSpace:'srgb',background:'35465e',fog:null,lights:[],lampApi:false};
const host={os:{platform:'darwin'},macModel:'Mac17,6',git:{head:'abc'}},build={indexSha256:'x'};
/** One kind's curve against the stand-in page; everything the capture asked of the page and wrote is returned. */
async function runCurve({kind=KIND,plan,formation=formations.get(kind),page=curvePage(),check:checkFn=()=>{},log=[],blank,exposure=C.exposureRecord('day')}={}) {
 if(plan===undefined)plan=await planOf(kind);
 const published=new Map(),written=new Map(),order=[],shoot=screenshotOf(page,kind,{blank});let shots=0;
 Object.assign(globalThis,{window:page.window,document:page.document});
 try {
  C.catalogueDriver();
  let result;
  try {
   result=await C.captureCurve({kind,plan,formation,
    evaluate:async expression=>{log.push(expression);const value=await new Function('window','document',`return (${expression});`)(page.window,page.document);return value===undefined?undefined:JSON.parse(JSON.stringify(value));},
    screenshot:async()=>{shots++;return shoot();},
    publish:async(file,bytes,sidecar)=>{published.set(file,{bytes,sidecar});order.push(file);return file;},
    write:async(file,bytes)=>{written.set(file,bytes);order.push(file);},
    session,host,build,exposure,check:checkFn});
  } catch(error) {
   // an error thrown by the code under test is a failed assertion about it, so a test that expects the error matches its message and one that does not fails on it
   if(error instanceof assert.AssertionError)throw error;
   throw new assert.AssertionError({message:`captureCurve threw: ${error?.message}`,operator:'captureCurve'});
  }
  return {...result,plan,log,published,written,order,page,get shots() {return shots;}};
 } finally {delete globalThis.window;delete globalThis.document;}
}
const reportOf=(run,suffix='curve')=>JSON.parse(run.written.get(`${KIND}-${suffix}.json`).toString('utf8'));

// ---- the in-page driver --------------------------------------------------------------------------------------------------------------------
check('the in-page driver puts the specimen on the curved stage, poses the cars as the live trains are and reads them back, and takes it all away again',async()=>{
 const page=curvePage(),before=page.scene.children.slice(),f=formations.get(KIND),plan=await planOf(KIND);
 await withPage(page,async cat=>{
  const disposed=[],original=T.BufferGeometry.prototype.dispose;T.BufferGeometry.prototype.dispose=function(){disposed.push(this.type);return original.call(this);};
  let begun;try{begun=safely(()=>cat.beginCurve(KIND,f.length,plan.path));}finally{T.BufferGeometry.prototype.dispose=original;}
  const stages=page.scene.children.filter(o=>o.name==='capture-stage');
  assert.ok(disposed.includes('PlaneGeometry'),'the straight stage the specimen was begun on is disposed of, ground and all');
  {const sleepers=stages[0].children.find(c=>c.name==='capture-stage-sleepers'),m0=new T.Matrix4(),first=new T.Vector3();sleepers.getMatrixAt(0,m0);first.setFromMatrixPosition(m0);
   vec([first.x,first.z],F.pointAlong(plan.path,F.cumulative(plan.path),.325),1e-5,'the curved stage is laid from the start of the route');}
  assert.deepEqual(begun.hidden,[{name:'train-shed',type:'Group'},{name:'terrain',type:'Group'}]);assert.deepEqual(begun.hiddenDom,page.chromeNames);
  assert.equal(stages.length,1,'the straight stage the specimen was begun on is taken away, and the curved one stands');
  assert.deepEqual(begun.stage,stages[0].userData.levels);assert.equal(begun.stage.zRange,undefined,'it has no straight run');assert.equal(begun.stage.route.points,plan.path.length);near(begun.stage.route.lengthM,F.cumulative(plan.path).at(-1),2e-6);
  assert.equal(begun.children.filter(c=>c.name==='capture-stage').length,1);assert.equal(begun.children.filter(c=>c.name===`train-${KIND}`).length,1);
  assert.deepEqual(begun.children.slice(-2).map(c=>c.name),[`train-${KIND}`,'capture-stage'],'the scene as it stands once the curved stage has replaced the straight one, which was added before the train');
  assert.equal(begun.stage.sleepers,Math.floor(F.cumulative(plan.path).at(-1)/.65),'the stage follows the route\'s length');
  assert.ok(!page.scene.children.some(o=>o.name==='capture-stage'&&o.userData.levels.zRange),'no stage of a straight run is left in the scene');
  // as built, the cars are where the model puts them: on a straight, unturned and unstretched
  const rest=safely(()=>cat.readCurve());assert.equal(rest.cars.length,f.cars.length);rest.cars.forEach(c=>{vec(c.position,[0,0,0]);near(c.rotationY,0,1e-12);near(c.scaleZ,1,1e-12);assert.equal(c.visible,true);});
  assert.equal(rest.bogies.length,2*f.cars.length);
  // posed: each car where the plan has it, and each bogie read where it stands, in the specimen's frame and in the world
  const posed=safely(()=>cat.poseCars(JSON.parse(JSON.stringify(plan.cars))));
  assert.deepEqual(posed.cars.map(c=>c.name),f.cars.map(c=>`car-${c.index}`));
  posed.cars.forEach((c,i)=>{const want=plan.cars[i];vec([c.position[0],c.position[2]],want.position,1e-9);near(c.position[1],0,0);near(c.rotationY,want.rotationY,1e-9);near(c.scaleZ,want.scaleZ,1e-9);assert.equal(c.visible,true);});
  assert.deepEqual(posed.bogies.map(b=>b.name).sort(),plan.bogies.map(b=>b.name).sort());
  for(const b of posed.bogies){const want=plan.bogies.find(x=>x.name===b.name);vec([b.local[0],b.local[2]],want.point,1e-5,b.name);near(b.local[1],0,1e-9);}
  const judged=F.judgeCurvePage(plan,posed);assert.deepEqual(judged.problems,[]);assert.deepEqual(judged.findings,[]);assert.equal(judged.bogies.ok,true);
  // the same read, the way the capture takes it on its own
  assert.deepEqual(cat.readCurve(),posed);
  // isolating the specimen and bringing it back restores the cars as they were posed; posing again starts from there, so a car left unposed stays hidden
  cat.isolate('empty');cat.poseCars(JSON.parse(JSON.stringify(plan.cars.slice(0,3))));cat.isolate('empty');cat.isolate('all');
  assert.deepEqual(cat.readCurve().cars.map(c=>c.visible),[true,true,true,false],'what was shown before posing is not restored over the new pose');
  cat.poseCars(JSON.parse(JSON.stringify(plan.cars)));
  // the specimen stays where it is: one is on stage, so another is refused
  assert.throws(()=>cat.beginCurve(KIND,f.length,plan.path),/a specimen is already on stage/);
  assert.equal(safely(()=>cat.end()),true);
 });
 assert.deepEqual(page.scene.children,before,'the scene is as the page had it');assert.ok(page.scene.children.every(o=>o.visible),'the shed and the terrain are shown again');assert.equal(page.h1.style.display,'');assert.equal(page.label(),null);
 // a car that is not posed is hidden, and so are its bogies: the page reads fewer of both
 const page2=curvePage();
 await withPage(page2,async cat=>{
  cat.beginCurve(KIND,f.length,plan.path);const three=safely(()=>cat.poseCars(JSON.parse(JSON.stringify(plan.cars.slice(0,3)))));
  assert.deepEqual(three.cars.map(c=>c.visible),[true,true,true,false]);assert.equal(three.bogies.length,6);cat.end();
 });
});

// ---- the steps of a view -------------------------------------------------------------------------------------------------------------------
check('the steps of a view ask the page for the station view when the view is V10 and for the view otherwise, with the label; a view that needs a page function the page lacks is unavailable, with the reason',async()=>{
 const asked=[],make=(extra={})=>C.catalogueViewSteps({kind:KIND,formation:formations.get(KIND),evaluate:async e=>{asked.push(e);return {inspection:{clear:true,from:e}};},screenshot:async()=>Buffer.alloc(0),publish:async()=>'x',session:{lampApi:false},host,build,state:{},
  exposure:C.exposureRecord('day'),label:v=>`label of ${v.id} ${v.suffix}`,...extra});
 const steps=make(),v10={id:'V10',suffix:'station'},v01={id:'V01',suffix:'front-3m'};
 assert.deepEqual(await steps.inspect(v10),{clear:true,from:asked[0]},'what the page says of a view is the inspection');assert.equal(asked[0],`window.__cat.stationView(${JSON.stringify(v10)},"label of V10 station")`);
 assert.deepEqual(await steps.inspect(v01),{clear:true,from:asked[1]});assert.equal(asked[1],`window.__cat.view(${JSON.stringify(v01)},"label of V01 front-3m")`);
 const lamp={id:'V08',suffix:'lamps',capability:{function:'setTrainLampState',state:'x',reason:'the page has no lamp API'}};
 assert.equal(steps.unavailable(lamp),'the page has no lamp API');assert.equal(steps.unavailable(v01),null,'a view that needs nothing is available');
 assert.equal(make({session:{lampApi:true}}).unavailable(lamp),null,'a page that has the function makes the view available');
 let checked=0;make({check:()=>{checked++;}}).check();assert.equal(checked,1,'the deadline check is the caller\'s');
 assert.doesNotThrow(()=>steps.check(),'and there is one if the caller gives none');
});

// ---- the curve of one kind -----------------------------------------------------------------------------------------------------------------
check('a curve on the stand-in page is two pictures with a sidecar each and a report, the cars posed as the plan has them, the bogies read on the path, and no check failed',async()=>{
 let checks=0;
 const run=await runCurve({check:()=>{checks++;}}),{entry,verdict,plan}=run,pictures=[`${KIND}-curve-plan.png`,`${KIND}-curve-oblique.png`];
 assert.deepEqual(run.order,[...pictures,`${KIND}-curve.json`],'the pictures in order, then the report');assert.equal(checks,3,'the deadline is checked before the page is touched and before each view');
 assert.deepEqual([...run.published.keys()],pictures);assert.deepEqual([...run.written.keys()],[`${KIND}-curve.json`]);
 // what the capture asked of the page: the stage, the cars, then for each view the view and the photographs, then the stage taken away
 assert.equal(run.log.length,2+2*4+1);assert.equal(run.log[0],`window.__cat.beginCurve("${KIND}",${plan.lengthM},${JSON.stringify(plan.path)})`);assert.equal(run.log[1],`window.__cat.poseCars(${JSON.stringify(plan.cars)})`);assert.equal(run.log.at(-1),'window.__cat.end()');
 run.log.slice(2,-1).forEach((e,i)=>assert.match(e,[/^window\.__cat\.view\(\{/,/^window\.__cat\.assertChrome\(\)$/,/^window\.__cat\.isolate\('empty'\)$/,/^window\.__cat\.isolate\('all'\)$/][i%4],`call ${i}`));
 assert.equal(run.shots,4,'a picture and its empty-stage baseline for each view');
 assert.ok(run.log[2].endsWith(`,"${KIND} catalogue specimen on ${F.CURVE_STAGE} - C01 curve-plan - tightest real bend, R 98.7 m")`));assert.ok(run.log[6].endsWith(`,"${KIND} catalogue specimen on ${F.CURVE_STAGE} - C01 curve-oblique - tightest real bend, R 98.7 m")`));
 // the verdict and the manifest entry
 assert.deepEqual(verdict,{status:'PASS',findings:[],bodies:plan.checks.bodies,couplers:plan.checks.couplers,gangways:plan.checks.gangways,bogies:verdict.bogies});assert.equal(verdict.bogies.ok,true);assert.equal(verdict.bogies.count,2*formations.get(KIND).cars.length);
 assert.deepEqual([entry.id,entry.suffix],['C01','curve']);assert.deepEqual(entry.plan,F.curvePoseOf(plan));assert.equal(entry.notes,plan.notes);
 assert.deepEqual(entry.outcome,{status:'OK',reason:null,report:`${KIND}-curve.json`,stage:F.CURVE_STAGE,views:pictures.map((file,i)=>({suffix:F.CURVE_VIEWS[i],status:'OK',reason:null,file})),checks:{status:'PASS',findings:0}});
 // a sidecar: the usual one of a picture, and what makes it a view of the curve
 for(const [i,suffix] of F.CURVE_VIEWS.entries()) {
  const side=run.published.get(pictures[i]).sidecar,view=plan.views[i];
  assert.deepEqual([side.rubric,side.schema,side.kind,side.file],[F.CATALOGUE.rubric,'kx-catalogue-sidecar/1',KIND,pictures[i]]);
  assert.deepEqual([side.view.id,side.view.suffix,side.view.frame,side.view.car,side.view.capability],['C01',suffix,'curve',null,null]);assert.equal(side.view.notes.stage,F.CURVE_STAGE);assert.equal(side.view.notes,view.notes);
  assert.deepEqual(side.specimen.rotationRule,view.rotation);near(side.specimen.rotationY,view.rotation.rotationY,1e-12);
  vec(side.pose.trainLocal.eye,view.eye,1e-9);vec(side.pose.trainLocal.target,view.target,1e-9);near(side.pose.world.positionErrorM,0,1e-9);
  assert.equal(side.visibility.clear,true);assert.equal(side.pixels.ok,true);assert.ok(side.pixels.changedPixels>30);assert.ok(side.pixels.sampleHits.total>0&&side.pixels.sampleHits.rate>=.5,'the picture is judged against the samples the page checked');
  assert.deepEqual(Object.keys(side.timings),['inspect','shoot','verify']);assert.ok(Object.values(side.timings).every(t=>typeof t==='number'&&t>=0),'what each step took');
  assert.equal(side.renderState.exposure,'day');
  assert.deepEqual(side.hiddenSceneNames,[{name:'terrain',type:'Group'},{name:'train-shed',type:'Group'}],'sorted by name');
  assert.deepEqual(side.curve,{id:'C01',stage:F.CURVE_STAGE,view:suffix,route:plan.route,noseM:plan.noseM,checks:{status:'PASS',findings:0,bodies:plan.checks.bodies,couplers:plan.checks.couplers,gangways:plan.checks.gangways,bogies:verdict.bogies}});
  assert.equal(side.formation.lengthM,formations.get(KIND).length);
 }
 // the picture is the stand-in's: a block where the train is
 const plan_png=readPng(run.published.get(pictures[0]).bytes);assert.deepEqual([plan_png.width,plan_png.height],[PNG_W,PNG_H]);
 {let train=0;for(let i=0;i<plan_png.pixels.length;i+=3)if(plan_png.pixels[i]===TRAIN[0]&&plan_png.pixels[i+1]===TRAIN[1]&&plan_png.pixels[i+2]===TRAIN[2])train++;assert.ok(train>100,`the picture published is the one with the train in it, not the empty stage: ${train} pixels of the train`);}
 // the report
 const report=reportOf(run),f=formations.get(KIND);
 assert.deepEqual([report.rubric,report.schema,report.kind,report.id,report.status,report.reason,report.stage,report.rule],[F.CATALOGUE.rubric,'kx-catalogue-curve/1',KIND,'C01','OK',null,F.CURVE_STAGE,F.CURVE_RULE]);
 assert.deepEqual(report.route,JSON.parse(JSON.stringify(plan.route)));assert.equal(report.noseM,plan.noseM);assert.deepEqual(report.path,plan.path);
 assert.deepEqual(report.formation,{kind:KIND,family:f.family,classes:f.classes,classNote:f.classNote,lengthM:f.length,cars:f.cars.map(({index,type,length,start,end,cab,bogies,motor,pantograph})=>({index,type,length,start,end,cab,bogies,motor,pantograph}))});
 assert.deepEqual([report.checks.status,report.checks.findings],['PASS',[]]);assert.deepEqual(report.checks.bodies,plan.checks.bodies);assert.match(report.checks.reading,/bodies: the footprints of two neighbours must not touch; couplers and gangways: .*END_GAP.*bogies: .*within 1 cm/);
 {const text=run.written.get(`${KIND}-curve.json`).toString('utf8');assert.ok(text.endsWith('}\n'),'a text file ends with a line');assert.match(text,/^\{\n  "rubric": /,'indented by two');}
 assert.deepEqual(report.joints,JSON.parse(JSON.stringify(plan.joints)));assert.equal(report.joints.length,f.cars.length-1);
 assert.equal(report.bogies.length,2*f.cars.length);for(const row of report.bogies){assert.ok(row.offTrackM<F.CURVE.bogieToleranceM);assert.deepEqual(Object.keys(row),['name','car','k','plannedPoint','local','world','offTrackM','plannedErrorM']);}
 assert.deepEqual(report.pageProblems,[]);
 assert.deepEqual(report.views.map(v=>[v.suffix,v.status,v.reason,v.file]),pictures.map((file,i)=>[F.CURVE_VIEWS[i],'OK',null,file]));
 for(const [i,v] of report.views.entries()){assert.deepEqual([v.eye,v.target,v.up,v.fov,v.near,v.distanceM,v.rotation],[plan.views[i].eye,plan.views[i].target,plan.views[i].up,plan.views[i].fov,plan.views[i].near,plan.views[i].notes.distanceM,plan.views[i].rotation]);assert.equal(v.pixels.ok,true);assert.ok(v.visibleFraction>=.2);assert.ok(v.checkedSamples>0);}
 assert.equal(report.renderer,session.renderer);assert.equal(report.exposure,'day');assert.deepEqual(report.host,host.os);assert.equal(report.macModel,host.macModel);assert.deepEqual(report.git,host.git);assert.deepEqual(report.build,build);
 assert.deepEqual(report.hiddenSceneNames,[{name:'terrain',type:'Group'},{name:'train-shed',type:'Group'}]);assert.equal(report.stageLevels.railHeadTopY,0);
 assert.equal(run.page.scene.children.some(o=>o.name==='capture-stage'||o.name===`train-${KIND}`),false,'the stage and the specimen are taken away');
});

check('the exposure a curve is taken in is the one the sidecars and the report say',async()=>{
 const run=await runCurve({exposure:C.exposureRecord('dusk')});
 for(const file of [`${KIND}-curve-plan.png`,`${KIND}-curve-oblique.png`]){const side=run.published.get(file).sidecar;assert.equal(side.renderState.exposure,'dusk');assert.equal(side.renderState.rig,'atmosphere');}
 assert.equal(reportOf(run).exposure,'dusk');
});

check('a curve on the synthetic arc says so in the label of each picture and in the report',async()=>{
 const f=formations.get(KIND),route=F.curveRouteFor({nodes:[],rails:[]},f.length+20,{fallbackRadiusM:100}),plan=safely(()=>C.planCurveFor(f,{route,placement:C.placementRoute(route)}));
 assert.equal(plan.status,'OK');const run=await runCurve({plan});
 assert.ok(run.log[2].endsWith(`,"${KIND} catalogue specimen on ${F.CURVE_STAGE} - C01 curve-plan - SYNTHETIC arc, R 100.0 m")`),run.log[2].slice(-120));assert.ok(run.log[6].endsWith(`- C01 curve-oblique - SYNTHETIC arc, R 100.0 m")`));
 const report=reportOf(run);assert.equal(report.route.source,'synthetic');assert.equal(report.status,'OK');assert.deepEqual(report.views.map(v=>v.status),['OK','OK']);
});

check('a curve with joints that fail the bellows check is OK as a set of pictures, and a FINDING in the report, the entry and each sidecar',async()=>{
 const run=await runCurve({kind:FINDINGS_KIND}),{entry,verdict,plan}=run;
 assert.equal(plan.checks.findings.length,3,'two gangway edges and a coupler are further apart than a bellows reaches on the 98.7 m bend');
 assert.equal(verdict.status,'FINDING');assert.equal(verdict.findings.length,3);assert.equal(entry.outcome.status,'OK','a finding is the model\'s, not a failed picture');assert.equal(entry.outcome.reason,null);assert.deepEqual(entry.outcome.checks,{status:'FINDING',findings:3});
 assert.deepEqual(entry.outcome.views.map(v=>v.status),['OK','OK']);assert.deepEqual([...run.published.keys()],[`${FINDINGS_KIND}-curve-plan.png`,`${FINDINGS_KIND}-curve-oblique.png`]);
 const report=JSON.parse(run.written.get(`${FINDINGS_KIND}-curve.json`).toString('utf8'));
 assert.equal(report.status,'OK');assert.equal(report.checks.status,'FINDING');assert.equal(report.checks.findings.length,3);
 assert.deepEqual(report.checks.findings.map(x=>x.check).sort(),['coupler','gangway','gangway']);
 for(const x of report.checks.findings){assert.ok(x.distanceM>x.reachM);assert.equal(x.reachM,.35);assert.match(x.message,/more than the 0\.35 m one bellows reaches$/);}
 assert.equal(report.checks.couplers.ok,false);assert.equal(report.checks.gangways.ok,false);assert.equal(report.checks.bodies.ok,true);assert.equal(report.checks.bogies.ok,true);
 for(const file of [`${FINDINGS_KIND}-curve-plan.png`,`${FINDINGS_KIND}-curve-oblique.png`]){const side=run.published.get(file).sidecar;assert.deepEqual([side.curve.checks.status,side.curve.checks.findings],['FINDING',3]);assert.equal(side.pixels.ok,true);}
});

check('a bogie the page stands off the track is a finding with its distance, and the pictures are still taken',async()=>{
 const off=group=>{group.getObjectByName('bogie-1-0').position.x+=.5;return group;};
 const run=await runCurve({page:curvePage({decorate:off})}),{entry,verdict}=run;
 assert.equal(entry.outcome.status,'OK');assert.equal(verdict.status,'FINDING');assert.deepEqual(verdict.findings.map(x=>[x.check,x.bogie]),[['bogie-on-track','bogie-1-0']]);assert.equal(verdict.bogies.ok,false);
 const x=verdict.findings[0];assert.ok(x.offTrackM>.499&&x.offTrackM<.501,`${x.offTrackM}`);assert.equal(x.toleranceM,.01);assert.match(x.message,/^bogie-1-0 stands 0\.(49|50)\d\d m from the track, more than the 0\.01 m allowed$/);
 assert.deepEqual(entry.outcome.checks,{status:'FINDING',findings:1});assert.equal(run.published.size,2);
 const report=reportOf(run),row=report.bogies.find(b=>b.name==='bogie-1-0');assert.ok(row.offTrackM>.499&&row.offTrackM<.501);assert.ok(report.bogies.filter(b=>b.name!=='bogie-1-0').every(b=>b.offTrackM<1e-5));
});

// ---- a curve that cannot be vouched for ----------------------------------------------------------------------------------------------------
check('a plan that is already a GAP is recorded without touching the page, and says why',async()=>{
 const plan=await planOf(KIND),gap={...plan,status:'GAP',reason:'the page\'s placement code (carPoses) disagrees with the geometry: x',views:[],cars:[],bogies:[],joints:[],checks:null,noseM:null},log=[];
 const run=await runCurve({plan:gap,log});
 assert.deepEqual(log,[],'the page is not touched');assert.equal(run.published.size+run.written.size,0);assert.equal(run.shots,0);
 assert.deepEqual(run.entry.outcome,{status:'GAP',reason:gap.reason,report:null,stage:F.CURVE_STAGE,views:[],checks:{status:'NOT RUN',findings:0}});assert.deepEqual(run.verdict,{status:'NOT RUN',findings:[],bodies:null,couplers:null,gangways:null,bogies:null});
 assert.deepEqual(run.entry.plan,F.curvePoseOf(gap));
});

check('a page that is not as the cars were posed makes the curve a GAP with the reason, no pictures, and the stage still taken away',async()=>{
 const plan=await planOf(KIND),short={...plan,cars:plan.cars.slice(0,3)},log=[];
 // the cars that were not posed are hidden by the page: it reads three, and no bogies for the fourth
 const run=await runCurve({plan:short,log});
 assert.equal(run.entry.outcome.status,'GAP');assert.equal(run.entry.outcome.reason,'the page is not as the capture posed it: the specimen has 4 cars, the capture posed 3; car-3 is not where the capture put it; the page reports no bogie-3-0','three of the four problems are listed');
 assert.equal(run.published.size,0,'no picture of a curve the page did not pose');assert.deepEqual([...run.written.keys()],[`${KIND}-curve.json`],'the report is written, with the problems');
 assert.equal(run.log.at(-1),'window.__cat.end()');assert.equal(run.log.length,3,'the stage, the cars, and the stage taken away');assert.equal(run.page.scene.children.some(o=>o.name==='capture-stage'),false);
 const report=reportOf(run);assert.equal(report.status,'GAP');assert.equal(report.reason,run.entry.outcome.reason);assert.deepEqual(report.pageProblems,['the specimen has 4 cars, the capture posed 3','car-3 is not where the capture put it','the page reports no bogie-3-0','the page reports no bogie-3-1']);assert.deepEqual(report.views,[]);
 assert.equal(run.entry.outcome.report,`${KIND}-curve.json`);assert.deepEqual(run.entry.outcome.views,[]);
 // more than three problems are not all listed
 const none={...plan,cars:[]},bad=await runCurve({plan:none});assert.equal(bad.entry.outcome.status,'GAP');assert.equal(bad.entry.outcome.reason.split('; ').length,3,'three of the problems are listed');assert.match(bad.entry.outcome.reason,/^the page is not as the capture posed it: /);
});

check('a view whose picture does not show the train is a GAP with the reason and the other view is still taken',async()=>{
 const run=await runCurve({blank:label=>/curve-plan/.test(label)});
 assert.equal(run.entry.outcome.status,'GAP');assert.match(run.entry.outcome.reason,/^curve-plan: picture shows no specimen: only 0 pixels differ from the empty stage \(need 30\)$/);
 assert.deepEqual(run.entry.outcome.views.map(v=>[v.suffix,v.status,v.file]),[['curve-plan','GAP',null],['curve-oblique','OK',`${KIND}-curve-oblique.png`]]);assert.match(run.entry.outcome.views[0].reason,/picture shows no specimen/);assert.equal(run.entry.outcome.views[1].reason,null);
 assert.deepEqual([...run.published.keys()],[`${KIND}-curve-oblique.png`]);
 const report=reportOf(run);assert.equal(report.status,'GAP');assert.deepEqual(report.views.map(v=>[v.suffix,v.status,v.file]),[['curve-plan','GAP',null],['curve-oblique','OK',`${KIND}-curve-oblique.png`]]);
 assert.equal(run.entry.outcome.checks.status,'PASS','the geometry\'s checks are not the pictures\'');
 // both blank: both reasons, in order
 const both=await runCurve({blank:()=>true});assert.match(both.entry.outcome.reason,/^curve-plan: picture shows no specimen.*; curve-oblique: picture shows no specimen/);assert.equal(both.published.size,0);
});

check('the deadline stops the run at once, the stage is taken away, and a page that refuses the stage stops it before anything is posed',async()=>{
 let n=0;const log=[],page=curvePage();
 await assert.rejects(runCurve({page,log,check:()=>{if(++n===2)throw new Error('deadline passed');}}),/captureCurve threw: deadline passed/);
 assert.equal(log.at(-1),'window.__cat.end()','the specimen is taken off the stage');assert.equal(log.length,3,'begun, posed, and then the deadline in front of the first view');assert.equal(page.scene.children.some(o=>o.name==='capture-stage'),false);
 let m=0;await assert.rejects(runCurve({check:()=>{if(++m===1)throw new Error('too late');}}),/captureCurve threw: too late/);
 const busy=curvePage();Object.assign(globalThis,{window:busy.window,document:busy.document});
 try {
  C.catalogueDriver();busy.window.__cat.beginCurve(KIND,formations.get(KIND).length,(await planOf(KIND)).path);
  const log2=[];await assert.rejects(C.captureCurve({kind:KIND,plan:await planOf(KIND),formation:formations.get(KIND),evaluate:async e=>{log2.push(e);return JSON.parse(JSON.stringify(await new Function('window','document',`return (${e});`)(busy.window,busy.document)??null));},screenshot:async()=>Buffer.alloc(0),publish:async()=>'x',write:async()=>{},session,host,build,exposure:C.exposureRecord('day')}),/a specimen is already on stage/);
  assert.equal(log2.length,1,'nothing is posed and the stage that was already there is not taken away');
 } finally {busy.window.__cat.end();delete globalThis.window;delete globalThis.document;}
});

// ---- the manifest, argv and the frozen plans -----------------------------------------------------------------------------------------------
check('the manifest names the curve once, with the route in the page\'s world, and a kind\'s entry carries its frozen plan, the outcome and where the files are',async()=>{
 const curve=await route(),head=C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,curve,generated:'2026-11-09T00:00:00Z'}),m=C.curveManifest(curve);
 assert.deepEqual(head.curve,m);assert.ok(!('curve' in C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,generated:'2026-11-09T00:00:00Z'})),'a run without C01 says nothing of it');assert.ok(!('curve' in C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,curve:null,generated:'x'})));
 assert.deepEqual(Object.keys(m),['id','suffix','stage','rule','longestKind','longestM','trackData','route','views','exposure']);
 assert.deepEqual([m.id,m.suffix,m.stage,m.rule,m.longestKind,m.longestM,m.views,m.exposure],['C01','curve',F.CURVE_STAGE,F.CURVE_RULE,'gn387x12',curve.longest.lengthM,F.CURVE_VIEWS,'day']);assert.deepEqual(m.trackData,curve.trackData);assert.equal(m.trackData.sha256.length,64);
 const r=curve.route;assert.deepEqual(Object.keys(m.route),['source','smooth','radiusM','turnDeg','baselineM','apex','lengthM','apexS','points','steps','apexAt','ways','services','tunnel','chain','searched','frame']);
 assert.deepEqual([m.route.source,m.route.smooth,m.route.radiusM,m.route.turnDeg,m.route.baselineM,m.route.apex,m.route.lengthM,m.route.apexS,m.route.points,m.route.steps,m.route.apexAt,m.route.ways,m.route.services,m.route.tunnel,m.route.chain,m.route.searched,m.route.frame],
  [r.source,r.smooth,r.radiusM,r.turnDeg,r.baselineM,r.apex,r.lengthM,r.apexS,r.points,r.steps,r.apexAt,r.ways,r.services,r.tunnel,r.chain,r.searched,r.local]);assert.ok(!('note' in m.route),'a route of the page\'s track has no note');
 const arc=F.curveRouteFor({nodes:[],rails:[]},100),synthetic=C.curveManifest({route:arc,longest:{kind:'gn387x12',lengthM:100},trackData:{file:'x',sha256:'0'.repeat(64)}});assert.equal(synthetic.route.note,arc.note);assert.equal(synthetic.route.source,'synthetic');assert.equal(synthetic.route.steps,null);
 const plan=await planOf(KIND),views=[{view:{suffix:'curve-plan'},status:'OK',reason:null,file:'a.png',extra:1},{view:{suffix:'curve-oblique'},status:'GAP',reason:'r'}],verdict={status:'FINDING',findings:[1,2]};
 const ok=C.curveManifestEntry(plan,{status:'OK',reason:null,report:`${KIND}-curve.json`,views,verdict});
 assert.deepEqual(ok,{id:'C01',suffix:'curve',plan:F.curvePoseOf(plan),notes:plan.notes,outcome:{status:'OK',reason:null,report:`${KIND}-curve.json`,stage:F.CURVE_STAGE,views:[{suffix:'curve-plan',status:'OK',reason:null,file:'a.png'},{suffix:'curve-oblique',status:'GAP',reason:'r',file:null}],checks:{status:'FINDING',findings:2}}});
 const gap=C.curveManifestEntry(plan,{status:'GAP',reason:'why',verdict:{status:'NOT RUN',findings:[]}});assert.deepEqual([gap.outcome.reason,gap.outcome.report,gap.outcome.views,gap.outcome.checks],['why',null,[],{status:'NOT RUN',findings:0}]);
 const bare=C.curveManifestEntry(plan,{status:'OK',verdict});assert.deepEqual([bare.outcome.reason,bare.outcome.report,bare.outcome.views],[null,null,[]]);
});

check('the report of a curve that was never judged, with views that have no picture, says null for what it does not have, never undefined',async()=>{
 const plan=await planOf(KIND),f=formations.get(KIND),verdict=F.curveVerdict(plan);
 const view={...plan.views[0]},report=safely(()=>C.curveReport({kind:KIND,plan,formation:f,status:'GAP',reason:'r',verdict,page:null,results:[{view,status:'GAP'}],session,host,build,exposure:C.exposureRecord('day'),state:{hidden:[],stage:{}}}));
 assert.deepEqual([report.bogies,report.pageProblems],[[],[]],'a page that was never read has no bogies and no problems');
 assert.deepEqual(report.views[0],{suffix:view.suffix,status:'GAP',reason:null,file:null,eye:view.eye,target:view.target,up:view.up,fov:view.fov,near:view.near,distanceM:view.notes.distanceM,rotation:view.rotation,pixels:null,visibleFraction:null,checkedSamples:null});
 const entry=C.curveManifestEntry(plan,{status:'GAP',reason:'r',verdict,views:[{view:{suffix:'curve-plan'},status:'GAP'}]});
 assert.deepEqual(entry.outcome.views,[{suffix:'curve-plan',status:'GAP',reason:null,file:null}],'a view with no reason and no file says null for both');
});

check('--views takes C01 as an opt-in: the default views stay V01-V10, the curve is taken at day only, and it is listed last',()=>{
 const base=['--mode','catalogue','--dist','d','--out','o'],parse=extra=>safely(()=>C.parseCatalogueArgs([...base,...extra])),refuse=(extra,pattern,note)=>assert.throws(()=>C.parseCatalogueArgs([...base,...extra]),pattern,note);
 assert.deepEqual(parse([]).views,F.VIEW_IDS);assert.ok(!parse([]).views.includes('C01'));assert.deepEqual(parse(['--views','C01']).views,['C01']);assert.deepEqual(parse(['--views','C01,V04']).views,['V04','C01']);assert.deepEqual(parse(['--views','V10,C01,V01']).views,['V01','V10','C01']);
 assert.deepEqual(parse(['--views','M01,C01']).views,['M01','C01']);assert.deepEqual(parse(['--views','C01,M01']).views,['M01','C01'],'the order is the catalogue\'s, not the command line\'s');
 assert.deepEqual(parse(['--views','C01','--exposure','day']).views,['C01']);assert.deepEqual(safely(()=>parse(['--views','V01','--exposure','dusk'])).views,['V01'],'a dusk pass of the other views is as it was');assert.deepEqual(safely(()=>parse(['--exposure','dusk'])).views,F.VIEW_IDS);
 refuse(['--views','C01','--exposure','dusk'],/--views C01: the curve is taken at day only, not dusk/);refuse(['--views','V01,C01','--exposure','dusk'],/--views C01: the curve is taken at day only, not dusk/);refuse(['--views','M01,C01','--exposure','dusk'],/--views M01: the motion clip is taken at day only, not dusk/);
 refuse(['--views','C03'],/--views: unknown C03; expected V01,V02,V03,V04,V05,V06,V07,V08,V09,V10,M01,C01,C02/);refuse(['--views','C01,C01'],/--views: C01 repeated/);refuse(['--views','c01'],/unknown c01/);
 refuse(['--kinds','C01'],/--kinds: unknown C01/,'the kinds are still the kinds');
});

check('catalogue preflight plans the curve without Chrome, one OK curve per kind, and a held manifest of an earlier round does not refuse it',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/train-curve-test-'),log=console.log;
 try {
  const dist=path.join(dir,'dist'),out=path.join(dir,'out');await mkdir(dist);
  const run=async(...args)=>{const lines=[];console.log=(...a)=>lines.push(a.join(' '));try{await C.catalogueMain(['--mode','catalogue','--dist',dist,'--out',out,'--chrome','none',...args]);}finally{console.log=log;}return lines.map(l=>JSON.parse(l));};
  const ok=async(...args)=>{try{return await run(...args);}catch(e){assert.fail(`catalogueMain threw: ${e?.message}`);}};
  const [one]=await ok('--kinds','lner5,gn387x12','--views','C01');assert.deepEqual([one.catalogue,one.kinds,one.views,one.posesFrozen,one.exposure],[true,['lner5','gn387x12'],['C01'],false,'day']);assert.deepEqual(one.planned,{lner5:{OK:1},gn387x12:{OK:1}});
  const [all]=await ok('--views','C01');assert.deepEqual(all.planned,Object.fromEntries(ALL_KINDS.map(kind=>[kind,{OK:1}])),'every kind\'s curve is planned on the page\'s own track');
  const [dflt]=await ok('--kinds','lner5');assert.deepEqual(dflt.views,F.VIEW_IDS);
  const [v2]=await ok('--kinds','lner5','--views','V02'),[both]=await ok('--kinds','lner5','--views','V02,C01');
  assert.deepEqual(both.planned.lner5,{...v2.planned.lner5,OK:v2.planned.lner5.OK+1},'the curve adds one OK to the views beside it');assert.deepEqual(both.views,['V02','C01']);
  const [clip]=await ok('--kinds','lner5','--views','M01,C01');assert.deepEqual(clip.planned.lner5,{OK:2});
  // a manifest of an earlier round has no curve: it must neither refuse a run that asks for it nor be changed by it
  const poses=path.join(dir,'manifest.json'),earlier={rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:{lner5:{views:{}},gn387x12:{views:{}}}};
  for(const kind of ['lner5','gn387x12'])earlier.kinds[kind].views=Object.fromEntries(F.planCatalogueViews(formations.get(kind)).map(v=>[v.suffix,{plan:JSON.parse(JSON.stringify(F.poseOf(v)))}]));
  await writeFile(poses,JSON.stringify(earlier));
  const [frozen]=await ok('--kinds','lner5,gn387x12','--views','C01','--poses',poses);assert.equal(frozen.posesFrozen,true);assert.deepEqual(frozen.planned,{lner5:{OK:1},gn387x12:{OK:1}});
  const [mixed]=await ok('--kinds','lner5','--views','V01,C01','--poses',poses);assert.equal(mixed.posesFrozen,true);
  await assert.rejects(run('--kinds','lner5','--views','C01','--exposure','dusk','--poses',poses),/--views C01: the curve is taken at day only, not dusk/);
  // a manifest that does have a curve, planned differently, refuses
  const plan=await planOf('lner5'),moved=JSON.parse(JSON.stringify(earlier));moved.kinds.lner5.views.curve={plan:JSON.parse(JSON.stringify(F.curvePoseOf(plan)))};moved.kinds.lner5.views.curve.plan.views[0].eye[0]+=1;await writeFile(poses,JSON.stringify(moved));
  await assert.rejects(run('--kinds','lner5','--views','C01','--poses',poses),/refusing to capture: 1 pose\(s\) differ from .*lner5\/curve curve plan differs from the frozen plan at \/views\/0\/eye\/0/);
  const [skip]=await ok('--kinds','lner5','--views','V01','--poses',poses);assert.equal(skip.posesFrozen,true,'a run that does not ask for the curve does not compare it');
 } finally {console.log=log;await rm(dir,{recursive:true,force:true});}
});

check('the frozen plan of a curve is compared when both have one, within a tolerance, and an earlier round\'s manifest without one leaves nothing to drift from',async()=>{
 const kinds=['lner5','gn387x8'],plans=new Map();for(const kind of kinds)plans.set(kind,await planOf(kind));
 const mapOf=ks=>new Map(ks.map(kind=>[kind,{kind,views:[],curve:plans.get(kind)}]));
 const manifest=ks=>JSON.parse(JSON.stringify({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:Object.fromEntries(ks.map(kind=>[kind,{views:{curve:{plan:F.curvePoseOf(plans.get(kind))}}}]))}));
 const drifts=(frozen,m,options)=>safely(()=>C.frozenPoseDrift(frozen,m,options));
 const drift=(change,tol)=>{const m=manifest(kinds);change(m.kinds.lner5.views.curve.plan);return drifts(C.loadFrozenPoses(JSON.stringify(m)),mapOf(kinds),tol===undefined?{}:{tol});};
 const at=(change,tol)=>drift(change,tol)[0]?.at;
 // what a frozen curve plan is: the status, the length, the route, the path and the two views
 const frozen=manifest(kinds).kinds.lner5.views.curve.plan;
 assert.deepEqual(Object.keys(frozen),['status','lengthM','route','path','views']);assert.equal(frozen.status,'OK');assert.equal(frozen.lengthM,formations.get('lner5').length);assert.equal(frozen.views.length,2);assert.equal(frozen.route.source,'real');assert.equal(frozen.path.length,plans.get('lner5').path.length);
 assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(manifest(kinds))),mapOf(kinds)),[],'a curve planned again matches the one it froze, through a JSON round trip');
 const d=drift(p=>{p.views[1].eye[1]+=.01;});assert.deepEqual(d,[{kind:'lner5',view:'curve',reason:'curve plan differs from the frozen plan',at:'/views/1/eye/1'}]);
 assert.equal(at(p=>{p.views[0].target[2]-=.001;}),'/views/0/target/2');assert.equal(at(p=>{p.route.radiusM+=.01;}),'/route/radiusM');assert.equal(at(p=>{p.status='GAP';}),'/status');assert.equal(at(p=>{p.lengthM+=.01;}),'/lengthM');
 assert.equal(at(p=>{p.path[5][0]+=.001;}),'/path/5/0');assert.equal(at(p=>{p.views[0].fov=40;}),'/views/0/fov');
 assert.deepEqual(drift(p=>{p.views[0].eye[0]-=1e-9;}),[],'a nanometre is inside the tolerance');assert.deepEqual(drift(p=>{p.views[0].eye[0]-=.001;},.01),[],'a wider tolerance accepts it');assert.equal(at(p=>{p.views[0].eye[0]-=1e-9;},1e-12),'/views/0/eye/0');
 // nothing to compare: no frozen curve, a frozen entry without a plan, or a run that does not plan the curve
 const earlier=JSON.parse(JSON.stringify({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:{lner5:{views:{}},gn387x8:{views:{'front-3m':{plan:{}}}}}}));
 assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(earlier)),mapOf(kinds)),[],'the manifest of a round before the curve existed');
 const noPlan=manifest(kinds);delete noPlan.kinds.lner5.views.curve.plan;assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(noPlan)),mapOf(kinds)),[]);
 const without=new Map(kinds.map(kind=>[kind,{kind,views:[],curve:null}]));assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(manifest(kinds))),without),[]);
 assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(manifest(['lner5']))),mapOf(kinds)).map(x=>[x.kind,x.reason]),[['gn387x8','kind missing from the frozen poses']]);
 // the drift of another kind's curve is reported with its own kind
 const m2=manifest(kinds);m2.kinds.gn387x8.views.curve.plan.views[0].target[0]+=1;assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(m2)),mapOf(kinds)).map(x=>[x.kind,x.view,x.at]),[['gn387x8','curve','/views/0/target/0']]);
});

// ---- C02: the same on the bend that is typical of the track ----------------------------------------------------------------------------------------
check('C02 on the stand-in page is the same two pictures and a report under names of its own: the files, the labels, the entry, the sidecars and the rule say it is the typical bend',async()=>{
 const plan=await planNormalOf(KIND),run=await runCurve({plan}),pictures=[`${KIND}-curve-normal-plan.png`,`${KIND}-curve-normal-oblique.png`],radius=plan.route.radiusM.toFixed(1);
 assert.deepEqual(run.order,[...pictures,`${KIND}-curve-normal.json`]);assert.deepEqual([...run.published.keys()],pictures);assert.deepEqual([...run.written.keys()],[`${KIND}-curve-normal.json`]);
 assert.ok(run.log[2].endsWith(`,"${KIND} catalogue specimen on ${F.CURVE_STAGE} - C02 curve-normal-plan - typical real bend, R ${radius} m")`),run.log[2].slice(-140));
 assert.ok(run.log[6].endsWith(`,"${KIND} catalogue specimen on ${F.CURVE_STAGE} - C02 curve-normal-oblique - typical real bend, R ${radius} m")`),run.log[6].slice(-140));
 assert.match(run.log[0],new RegExp(`^window\\.__cat\\.beginCurve\\("${KIND}",${plan.lengthM},`));assert.equal(run.log[1],`window.__cat.poseCars(${JSON.stringify(plan.cars)})`);
 const {entry,verdict}=run;assert.equal(verdict.status,'PASS');assert.deepEqual([entry.id,entry.suffix],['C02','curve-normal']);assert.deepEqual(entry.plan,F.curvePoseOf(plan));assert.equal(entry.notes.rule,F.CURVE_NORMAL_RULE);
 assert.deepEqual(entry.outcome,{status:'OK',reason:null,report:`${KIND}-curve-normal.json`,stage:F.CURVE_STAGE,views:pictures.map((file,i)=>({suffix:F.CURVE_NORMAL_VIEWS[i],status:'OK',reason:null,file})),checks:{status:'PASS',findings:0}});
 for(const [i,file] of pictures.entries()) {
  const side=run.published.get(file).sidecar;
  assert.deepEqual([side.file,side.view.id,side.view.suffix,side.view.frame],[file,'C02',F.CURVE_NORMAL_VIEWS[i],'curve']);assert.equal(side.curve.id,'C02');assert.equal(side.curve.view,F.CURVE_NORMAL_VIEWS[i]);
  assert.deepEqual(side.curve.route.pick,plan.route.pick);assert.equal(side.curve.route.source,'real');assert.deepEqual([side.curve.checks.status,side.curve.checks.findings],['PASS',0]);assert.equal(side.pixels.ok,true);
 }
 const report=reportOf(run,'curve-normal');assert.deepEqual([report.schema,report.kind,report.id,report.status,report.rule],['kx-catalogue-curve/1',KIND,'C02','OK',F.CURVE_NORMAL_RULE]);
 assert.deepEqual(report.route.pick,plan.route.pick);assert.equal(report.route.radiusM,plan.route.radiusM);assert.deepEqual(report.views.map(v=>[v.suffix,v.status,v.file]),pictures.map((file,i)=>[F.CURVE_NORMAL_VIEWS[i],'OK',file]));
 // the tightest bend\'s report says its own rule, and the two differ
 const tight=await runCurve();assert.equal(reportOf(tight).rule,F.CURVE_RULE);assert.notEqual(report.rule,reportOf(tight).rule);assert.equal(reportOf(tight).id,'C01');
 // a plan that is a GAP is recorded under its own name too
 const gap=await runCurve({plan:{...plan,status:'GAP',reason:'why',views:[],cars:[],bogies:[],joints:[],checks:null,noseM:null}});assert.deepEqual([gap.entry.id,gap.entry.suffix,gap.entry.outcome.status],['C02','curve-normal','GAP']);
});

check('the manifest names C02 beside C01: the radius that is typical of the track and what it was made of, the bend nearest it, its views and its rule; a run without it says nothing of it',async()=>{
 const tight=await route(),normal=await normalRoute(),stamp='2026-11-09T00:00:00Z',head=C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,curve:tight,curveNormal:normal,generated:stamp});
 assert.deepEqual(head.curve,C.curveManifest(tight));assert.deepEqual(head.curveNormal,C.curveManifest(normal,F.CURVE_NORMAL));
 const m=head.curveNormal;assert.deepEqual(Object.keys(m),['id','suffix','stage','rule','longestKind','longestM','trackData','typical','route','views','exposure']);
 assert.deepEqual([m.id,m.suffix,m.stage,m.rule,m.longestKind,m.views,m.exposure],['C02','curve-normal',F.CURVE_STAGE,F.CURVE_NORMAL_RULE,'gn387x12',F.CURVE_NORMAL_VIEWS,'day']);assert.deepEqual(m.trackData,normal.trackData);assert.deepEqual(m.typical,normal.typical);
 assert.deepEqual(Object.keys(m.route),['source','smooth','radiusM','turnDeg','baselineM','apex','lengthM','apexS','points','steps','apexAt','ways','services','tunnel','chain','searched','frame','pick']);assert.deepEqual(m.route.pick,normal.route.pick);assert.deepEqual(m.route.frame,normal.route.local);
 // the tightest bend\'s entry has neither a typical radius nor a pick
 assert.ok(!('typical' in head.curve)&&!('pick' in head.curve.route));assert.equal(head.curve.rule,F.CURVE_RULE);assert.deepEqual(head.curve.views,F.CURVE_VIEWS);
 // the typical radius of a synthetic arc stands in the manifest too, with the note
 const arc=F.curveRouteFor({nodes:[],rails:[]},100,{typical:{radiusM:452}}),synthetic=C.curveManifest({route:arc,longest:{kind:'gn387x12',lengthM:100},trackData:{file:'x',sha256:'0'.repeat(64)},typical:{radiusM:452}},F.CURVE_NORMAL);
 assert.equal(synthetic.route.source,'synthetic');assert.equal(synthetic.route.note,arc.note);assert.ok(!('pick' in synthetic.route));assert.deepEqual(synthetic.typical,{radiusM:452});
 // a run without C02 says nothing of it, with or without C01
 assert.ok(!('curveNormal' in safely(()=>C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,curve:tight,generated:stamp}))),'with C01 alone');assert.ok(!('curveNormal' in safely(()=>C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,curve:tight,curveNormal:null,generated:stamp}))),'with C02 given as null');
 assert.ok(!('curveNormal' in safely(()=>C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,generated:stamp}))),'with neither');
 const only=C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,curveNormal:normal,generated:stamp});assert.ok(!('curve' in only));assert.deepEqual(only.curveNormal,head.curveNormal);
});

check('--views takes C02 as a second opt-in beside C01: not among the default views, day only, listed after C01 and the clip',()=>{
 const base=['--mode','catalogue','--dist','d','--out','o'],parse=extra=>safely(()=>C.parseCatalogueArgs([...base,...extra])),refuse=(extra,pattern)=>assert.throws(()=>C.parseCatalogueArgs([...base,...extra]),pattern);
 assert.ok(!parse([]).views.includes('C02'));assert.deepEqual(parse(['--views','C02']).views,['C02']);assert.deepEqual(parse(['--views','C02,C01']).views,['C01','C02'],'the order is the catalogue\'s');
 assert.deepEqual(parse(['--views','C02,V04,M01,C01']).views,['V04','M01','C01','C02']);assert.deepEqual(parse(['--views','C02','--exposure','day']).views,['C02']);
 refuse(['--views','C02','--exposure','dusk'],/--views C02: the curve is taken at day only, not dusk/);refuse(['--views','V01,C02','--exposure','dusk'],/--views C02: the curve is taken at day only, not dusk/);
 refuse(['--views','C01,C02','--exposure','dusk'],/--views C01: the curve is taken at day only, not dusk/);refuse(['--views','C02,C02'],/--views: C02 repeated/);refuse(['--views','c02'],/unknown c02/);
});

check('catalogue preflight plans C02 without Chrome beside C01 and the rest, and tells a held manifest that froze another typical curve from one that did not have it',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/train-curve-test-'),log=console.log;
 try {
  const dist=path.join(dir,'dist'),out=path.join(dir,'out');await mkdir(dist);
  const run=async(...args)=>{const lines=[];console.log=(...a)=>lines.push(a.join(' '));try{await C.catalogueMain(['--mode','catalogue','--dist',dist,'--out',out,'--chrome','none',...args]);}finally{console.log=log;}return lines.map(l=>JSON.parse(l));};
  const ok=async(...args)=>{try{return await run(...args);}catch(e){assert.fail(`catalogueMain threw: ${e?.message}`);}};
  const [one]=await ok('--kinds','lner5,gn387x12','--views','C02');assert.deepEqual([one.catalogue,one.kinds,one.views,one.posesFrozen,one.exposure],[true,['lner5','gn387x12'],['C02'],false,'day']);assert.deepEqual(one.planned,{lner5:{OK:1},gn387x12:{OK:1}});
  const [all]=await ok('--views','C02');assert.deepEqual(all.planned,Object.fromEntries(ALL_KINDS.map(kind=>[kind,{OK:1}])),'every kind\'s typical curve is planned on the page\'s own track');
  const [both]=await ok('--kinds','lner5','--views','C01,C02');assert.deepEqual(both.planned.lner5,{OK:2},'the two curves are two plans');assert.deepEqual(both.views,['C01','C02']);
  const [v2]=await ok('--kinds','lner5','--views','V02'),[mixed]=await ok('--kinds','lner5','--views','V02,C02');
  assert.deepEqual(mixed.planned.lner5,{...v2.planned.lner5,OK:v2.planned.lner5.OK+1},'the typical curve adds one OK to the views beside it');
  // a manifest of an earlier round has neither curve: it must not refuse a run that asks for either
  const poses=path.join(dir,'manifest.json'),earlier={rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:{lner5:{views:{}}}};
  earlier.kinds.lner5.views=Object.fromEntries(F.planCatalogueViews(formations.get('lner5')).map(v=>[v.suffix,{plan:JSON.parse(JSON.stringify(F.poseOf(v)))}]));await writeFile(poses,JSON.stringify(earlier));
  const [frozen]=await ok('--kinds','lner5','--views','C02','--poses',poses);assert.equal(frozen.posesFrozen,true);assert.deepEqual(frozen.planned,{lner5:{OK:1}});
  await assert.rejects(run('--kinds','lner5','--views','C02','--exposure','dusk','--poses',poses),/--views C02: the curve is taken at day only, not dusk/);
  // a manifest that froze the typical curve, planned differently, refuses; one that froze only the tightest bend\'s differently does not refuse a run of the typical one, and the other way round
  const normal=await planNormalOf('lner5'),tight=await planOf('lner5'),held=(suffix,plan)=>{const m=JSON.parse(JSON.stringify(earlier));m.kinds.lner5.views[suffix]={plan:JSON.parse(JSON.stringify(F.curvePoseOf(plan)))};m.kinds.lner5.views[suffix].plan.views[0].eye[0]+=1;return m;};
  await writeFile(poses,JSON.stringify(held('curve-normal',normal)));
  await assert.rejects(run('--kinds','lner5','--views','C02','--poses',poses),/refusing to capture: 1 pose\(s\) differ from .*lner5\/curve-normal curve plan differs from the frozen plan at \/views\/0\/eye\/0/);
  const [elsewhere]=await ok('--kinds','lner5','--views','C01','--poses',poses);assert.equal(elsewhere.posesFrozen,true,'a run of C01 does not compare C02\'s entry');
  await writeFile(poses,JSON.stringify(held('curve',tight)));
  const [other]=await ok('--kinds','lner5','--views','C02','--poses',poses);assert.equal(other.posesFrozen,true,'a run of C02 does not compare C01\'s entry');
  await assert.rejects(run('--kinds','lner5','--views','C01,C02','--poses',poses),/lner5\/curve curve plan differs from the frozen plan at \/views\/0\/eye\/0/);
  // asked together, each curve is planned on its own route: C02 is not planned on C01's tightest bend because that was loaded too. Frozen as they are planned alone, both are what the run plans again
  assert.notEqual(normal.route.radiusM,tight.route.radiusM,'the two routes are two bends');
  const together=JSON.parse(JSON.stringify(earlier));together.kinds.lner5.views.curve={plan:JSON.parse(JSON.stringify(F.curvePoseOf(tight)))};together.kinds.lner5.views['curve-normal']={plan:JSON.parse(JSON.stringify(F.curvePoseOf(normal)))};
  await writeFile(poses,JSON.stringify(together));
  const [pair]=await ok('--kinds','lner5','--views','C01,C02','--poses',poses);assert.equal(pair.posesFrozen,true,'each of the two plans equals its own frozen entry');
 } finally {console.log=log;await rm(dir,{recursive:true,force:true});}
});

check('the frozen plans of C01 and C02 are compared each with its own entry, within a tolerance, and an earlier round\'s manifest without either leaves nothing to drift from',async()=>{
 const kinds=['lner5','gn387x8'],tight=new Map(),normal=new Map();for(const kind of kinds){tight.set(kind,await planOf(kind));normal.set(kind,await planNormalOf(kind));}
 const mapOf=(ks,{curve=true,curveNormal=true}={})=>new Map(ks.map(kind=>[kind,{kind,views:[],curve:curve?tight.get(kind):null,curveNormal:curveNormal?normal.get(kind):null}]));
 const manifest=ks=>JSON.parse(JSON.stringify({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:Object.fromEntries(ks.map(kind=>[kind,{views:{curve:{plan:F.curvePoseOf(tight.get(kind))},'curve-normal':{plan:F.curvePoseOf(normal.get(kind))}}}]))}));
 const drifts=(m,map,options)=>safely(()=>C.frozenPoseDrift(C.loadFrozenPoses(JSON.stringify(m)),map,options));
 assert.deepEqual(drifts(manifest(kinds),mapOf(kinds)),[],'both planned again match what they froze, through a JSON round trip');
 // a drift of C02 is C02\'s, of its kind and where; one of C01 is C01\'s; both at once are both, C01 first
 const m=manifest(kinds);m.kinds.lner5.views['curve-normal'].plan.views[1].target[2]+=1;
 assert.deepEqual(drifts(m,mapOf(kinds)),[{kind:'lner5',view:'curve-normal',reason:'curve plan differs from the frozen plan',at:'/views/1/target/2'}]);
 m.kinds.lner5.views.curve.plan.route.radiusM+=1;assert.deepEqual(drifts(m,mapOf(kinds)).map(d=>[d.kind,d.view,d.at]),[['lner5','curve','/route/radiusM'],['lner5','curve-normal','/views/1/target/2']]);
 // the pick of the route is frozen: another stretch of track, at the same radius, is a drift
 const picked=manifest(kinds);picked.kinds.gn387x8.views['curve-normal'].plan.route.pick.meanDeviation+=.01;assert.deepEqual(drifts(picked,mapOf(kinds)).map(d=>[d.kind,d.view,d.at]),[['gn387x8','curve-normal','/route/pick/meanDeviation']]);
 // the tolerance is the usual one and can be given
 const tiny=manifest(kinds);tiny.kinds.lner5.views['curve-normal'].plan.views[0].eye[0]+=1e-9;assert.deepEqual(drifts(tiny,mapOf(kinds)),[]);assert.equal(drifts(tiny,mapOf(kinds),{tol:1e-12})[0]?.view,'curve-normal');
 // a run that does not plan one compares none of it; a manifest that does not have one has nothing to drift from
 assert.deepEqual(drifts(m,mapOf(kinds,{curve:false,curveNormal:false})),[]);assert.deepEqual(drifts(m,mapOf(kinds,{curve:false})).map(d=>d.view),['curve-normal']);assert.deepEqual(drifts(m,mapOf(kinds,{curveNormal:false})).map(d=>d.view),['curve']);
 const noNormal=manifest(kinds);for(const kind of kinds)delete noNormal.kinds[kind].views['curve-normal'];assert.deepEqual(drifts(noNormal,mapOf(kinds)),[],'the manifest of a round before C02 existed');
 const noPlan=manifest(kinds);delete noPlan.kinds.lner5.views['curve-normal'].plan;assert.deepEqual(drifts(noPlan,mapOf(kinds)),[]);
});

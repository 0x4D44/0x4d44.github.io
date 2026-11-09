// M01, the motion clip (rubric-FROZEN-v1, opt-in), against a stand-in for the page: the in-page driver (a stage given a run, one motion frame), the run of one kind's clip with its
// pictures, sidecars, contact sheet and report, a clip that cannot be vouched for, the manifest, argv and the frozen poses. No Chrome and no GPU: the real pictures are checked by hand.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as T from 'three';
import {ALL_KINDS} from '../../core/train.ts';
import {buildTrain} from '../../web/src/train.ts';
import {readPng} from '../axis01-pixels.mjs';
import * as F from '../train-framing.mjs';
import * as C from '../train-capture.mjs';

/**
 * Every test of this file is declared with `check`: an error thrown by the code under test is a failed assertion about it, whatever the error is, so a change that makes the
 * code throw fails the test that called it the way a change that makes it wrong does. (A change that stops the file from loading still fails the file.)
 */
const check=(name,body)=>test(name,async t=>{try{await body(t);}catch(error){if(error instanceof assert.AssertionError)throw error;throw new assert.AssertionError({message:`${name}: threw ${error?.stack??error}`,operator:'check'});}});
const near=(a,b,tol=1e-6,note='')=>assert.ok(Math.abs(a-b)<=tol,`${note} ${a} is not ${b}`);
const vec=(a,b,tol=1e-6,note='')=>{assert.equal(a.length,b.length,note);a.forEach((v,i)=>near(v,b[i],tol,`${note}[${i}]`));};
const KIND='gn387x4';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** A call that must not throw: a mutated function that crashes fails an assertion in the test that called it, not the run of the file. */
const safely=work=>{let out;assert.doesNotThrow(()=>{out=work();});return out;};
const formations=new Map(ALL_KINDS.map(kind=>[kind,C.describeFormation(kind)]));
/** The plan of each kind, made when a test first asks for it. */
const planCache=new Map(),plans={get:kind=>{if(!planCache.has(kind))planCache.set(kind,safely(()=>F.planMotion(formations.get(kind))));return planCache.get(kind);}};
const drifts=(frozen,mapOfPlans,options)=>safely(()=>C.frozenPoseDrift(frozen,mapOfPlans,options));
const two=n=>String(n).padStart(2,'0');

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
 constructor(tagName,{id='',className='',display='block',rect=[0,0,200,24],stubborn=false}={}) {Object.assign(this,{tagName,id,className,display,rect,stubborn,parent:null,children:[],style:new FakeStyle(),textContent:'',visibility:'visible',opacity:'1'});}
 append(...kids) {for(const kid of kids){kid.parent=this;this.children.push(kid);}return this;}
 remove() {if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 contains(other) {for(let p=other;p;p=p.parent)if(p===this)return true;return false;}
 get shown() {for(let p=this;p;p=p.parent)if(!p.stubborn&&(p.style.getPropertyValue('display')||p.display)==='none')return false;return true;}
 getClientRects() {if(!this.shown)return [];const [x,y,width,height]=this.rect;return [{x,y,width,height,left:x,top:y,right:x+width,bottom:y+height}];}
 getBoundingClientRect() {const [x,y,width,height]=this.shown?this.rect:[0,0,0,0];return {x,y,width,height,left:x,top:y,right:x+width,bottom:y+height};}
}
/**
 * The page as the clip needs it: a scene with a shed, a terrain and the lights, a camera, the page's chrome around a canvas, and a renderer whose render does what THREE's does to
 * the things the capture reads: it resets the counters unless autoReset is off, updates the matrices, updates every visible LOD from the camera, and counts what is drawn. A page frame
 * is TWO renders, so a capture that read the counters of the last render alone would see half. `decorate` may change the train the page builds, `blank` names frames (1-based) in
 * which the train is drawn nowhere in the picture, `beforeRender` hooks run at the start of each render.
 */
function motionPage({decorate=g=>g,blank=[],beforeRender=[]}={}) {
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1.6,.5,9000),controls={target:new T.Vector3(),update(){}},frames=[];
 const sun=new T.DirectionalLight(0xffe8c2,1.7),hemi=new T.HemisphereLight(),shed=Object.assign(new T.Group(),{name:'train-shed'}),terrain=Object.assign(new T.Group(),{name:'terrain'});
 sun.position.set(-320,520,260);scene.add(hemi,sun,shed,terrain);
 const body=new FakeEl('BODY'),app=new FakeEl('DIV',{id:'app',rect:[0,0,1600,1000]}),canvas=new FakeEl('CANVAS',{rect:[0,0,1600,1000]});app.append(canvas);
 const h1=new FakeEl('H1',{rect:[1380,12,200,30]}),hud=new FakeEl('DIV',{className:'hud',display:'flex',rect:[16,960,1568,28]}),almanac=new FakeEl('DIV',{id:'almanac-back-host',rect:[0,0,109,41]});
 body.append(app,h1,hud,almanac);
 const find=(el,id)=>{for(const c of el.children){if(c.id===id)return c;const f=find(c,id);if(f)return f;}return null;};
 const document={body,getElementById:id=>find(body,id),createElement:tag=>new FakeEl(tag.toUpperCase())};
 const info={autoReset:true,render:{calls:0,triangles:0,frame:0},reset(){this.render.calls=0;this.render.triangles=0;}};
 const renderOnce=()=>{
  if(info.autoReset)info.reset();
  for(const hook of beforeRender)hook(scene);
  scene.updateMatrixWorld();camera.updateMatrixWorld();
  const walk=o=>{if(!o.visible)return;if(o.isLOD&&o.autoUpdate)o.update(camera);o.children.forEach(walk);};walk(scene);
  const cost=F.trainCosts(scene);info.render.calls+=cost.drawCalls;info.render.triangles+=cost.triangles;info.render.frame++;
 };
 // the livery paints on a canvas only where there is a document; the stand-in page has none that can, so the train is built as it is in the other tests
 const build=kind=>{const saved=globalThis.document;delete globalThis.document;try{return decorate(buildTrain(kind),kind);}finally{globalThis.document=saved;}};
 const k={scene,camera,controls,renderer:{info,domElement:canvas},evidenceBuildTrain:build,atmosphere:null};
 const window={__kx:k,__cat:{T,F},__signalFrame:t=>{frames.push(t);renderOnce();renderOnce();},innerWidth:1600,innerHeight:1000,
  getComputedStyle:el=>({visibility:el.visibility,opacity:el.opacity,display:el.shown?el.display:'none'})};
 return {k,window,document,scene,camera,controls,frames,info,body,app,canvas,h1,hud,almanac,shed,terrain,blank:new Set(blank),
  chromeNames:['h1','div.hud','div#almanac-back-host'],label:()=>document.getElementById('capture-train-label')};
}
async function withPage(page,work) {
 Object.assign(globalThis,{window:page.window,document:page.document});
 try {C.catalogueDriver();return await work(page.window.__cat);} finally {delete globalThis.window;delete globalThis.document;}
}
const PNG_W=400,PNG_H=250,BACKGROUND=[60,70,80],frameColour=n=>[200,40+n*10,30];
/** The picture of the stand-in page: a 400 x 250 grey-blue field, and, where the train is shown and the frame is not `blank`, a 40 x 20 block that moves with the frame number (read from the label). */
const screenshotOf=(page,kind)=>async()=>{
 const text=page.label()?.textContent??'',n=Number(/ - frame (\d+)\//.exec(text)?.[1]??0),group=page.scene.children.find(o=>o.name===`train-${kind}`);
 const drawn=!!group&&group.visible&&!page.blank.has(n),pixels=Buffer.alloc(PNG_W*PNG_H*3);
 for(let i=0;i<PNG_W*PNG_H;i++)pixels.set(BACKGROUND,i*3);
 if(drawn)for(let y=100;y<120;y++)for(let x=20+n*20;x<60+n*20;x++)pixels.set(frameColour(n),(y*PNG_W+x)*3);
 return C.encodePng({width:PNG_W,height:PNG_H,channels:3,pixels});
};
const session={renderer:'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)',size:[1600,1000],devicePixelRatio:1,toneMapping:0,toneMappingExposure:1,outputColorSpace:'srgb',background:'35465e',fog:null,lights:[],lampApi:false};
const host={os:{platform:'darwin'},macModel:'Mac17,6',git:{head:'abc'}},build={indexSha256:'x'};
/** One kind's clip against the stand-in page; everything the capture asked of the page and wrote is returned. */
async function runClip({kind=KIND,plan,formation=formations.get(kind),page=motionPage(),check=()=>{},log=[]}={}) {
 // the plan of the kind is the plan of the clip unless a test brings its own; a mutated plan that is not OK fails here, not in a later line that reads the frames it has not got
 if(plan===undefined){plan=plans.get(kind);assert.equal(plan.status,'OK',`the plan of ${kind} is OK: ${plan.reason}`);}
 const published=new Map(),written=new Map(),order=[],shoot=screenshotOf(page,kind);let clock=0,shots=0;
 Object.assign(globalThis,{window:page.window,document:page.document});
 try {
  C.catalogueDriver();
  let result;
  try {
   result=await C.captureMotionClip({kind,plan,formation,
    evaluate:async expression=>{log.push(expression);const value=await new Function('window','document',`return (${expression});`)(page.window,page.document);return value===undefined?undefined:JSON.parse(JSON.stringify(value));},
    screenshot:async()=>{shots++;return shoot();},
    publish:async(file,bytes,sidecar)=>{published.set(file,{bytes,sidecar});order.push(file);return file;},
    write:async(file,bytes)=>{written.set(file,bytes);order.push(file);},
    session,host,build,exposure:C.exposureRecord('day'),check,now:()=>clock++});
  } catch(error) {
   // an error thrown by the code under test is a failed assertion about it, so a test that expects the error matches its message and one that does not fails on it
   if(error instanceof assert.AssertionError)throw error;
   throw new assert.AssertionError({message:`captureMotionClip threw: ${error?.message}`,operator:'captureMotionClip'});
  }
  return {...result,log,published,written,order,page,get shots() {return shots;}};
 } finally {delete globalThis.window;delete globalThis.document;}
}
const frameFile=(kind,n)=>`${kind}-motion-${two(n)}.png`;
const sheetOf=run=>readPng(run.written.get(`${KIND}-motion-sheet.png`));
const px=(image,x,y)=>[...image.pixels.subarray((y*image.width+x)*image.channels,(y*image.width+x)*image.channels+3)];
const tileOrigin=n=>[8+(n%4)*408,8+Math.floor(n/4)*258];

// ---- the in-page driver --------------------------------------------------------------------------------------------------------------------
check('the in-page driver can be given a run for the stage, and one motion frame poses the cars, draws a frame, sums the renderer over every render of it and reports what the page drew',async()=>{
 const page=motionPage(),before=page.scene.children.slice(),plan=plans.get(KIND),f=formations.get(KIND),poses=safely(()=>C.motionPoses(f,plan)),spec=(i,extra={})=>({camera:plan.camera,cars:poses.frames[i].cars,clearanceMarginM:.25,...extra});
 await withPage(page,async cat=>{
  // the driver must not throw on a frame that is as it should be (a driver that throws fails an assertion here, not the run)
  const begin=(...args)=>safely(()=>cat.begin(...args)),frame=(i,extra,text='x')=>safely(()=>cat.motionFrame(spec(i,extra),text)),stop=()=>safely(()=>cat.end());
  const begun=begin(KIND,f.length,F.MOTION.zRange);
  assert.deepEqual(begun.stage.zRange,[-540,160]);assert.equal(begun.stage.sleepers,Math.floor(700/.65));assert.deepEqual(begun.hidden,[{name:'train-shed',type:'Group'},{name:'terrain',type:'Group'}]);assert.deepEqual(begun.hiddenDom,page.chromeNames);
  stop();
  assert.deepEqual(begin(KIND,f.length,null).stage.zRange,[-60,f.length+60],'no run is the stage 60 m past each end of the train');stop();
  assert.deepEqual(begin(KIND,f.length).stage.zRange,[-60,f.length+60]);stop();
  begin(KIND,f.length,F.MOTION.zRange);const group=page.scene.getObjectByName(`train-${KIND}`),stage=page.scene.getObjectByName('capture-stage');
  assert.equal(stage.userData.levels.railHeadTopY,0);assert.deepEqual(stage.userData.levels.zRange,[-540,160]);
  const frames0=page.frames.length,renders0=page.info.render.frame,r=frame(6,undefined,'label 7'),one=F.trainCosts(page.scene);
  assert.equal(page.frames.length-frames0,1,'one page frame');assert.equal(page.info.render.frame-renders0,2,'two renders in it');
  assert.deepEqual(r.info,{calls:2*one.drawCalls,triangles:2*one.triangles,renders:2},'the counters of both renders, not the last');assert.ok(one.drawCalls>1&&one.triangles>1000);assert.equal(page.info.autoReset,true,'and the flag is put back');
  assert.deepEqual(r.costs,F.trainCosts(group));assert.equal(r.labelText,'label 7');assert.equal(page.label().textContent,'label 7');assert.deepEqual(r.placement,{position:[0,0,0],rotationY:0});
  const again=frame(6,undefined,'label 7');assert.deepEqual(again.info,{calls:2*one.drawCalls,triangles:2*one.triangles,renders:2},'the next frame counts its own two renders, not the ones before it');
  assert.deepEqual(r.cars.map(c=>c.name),['car-0','car-1','car-2','car-3']);for(const c of r.cars){assert.equal(c.visible,true);near(c.position[0],0,1e-9);near(c.position[1],0,0);near(c.position[2],plan.frames[6].noseZ,1e-9);near(c.rotationY,0,1e-12);near(c.scaleZ,1,1e-12);}
  vec(r.pose.position,[-3.3,2.6,0],1e-9);vec(r.pose.target,[-3.3,2.6,-100],1e-9);assert.deepEqual([r.pose.fov,r.pose.near],[50,1]);near(r.pose.positionErrorM,0,1e-9);vec(page.controls.target.toArray(),[-3.3,2.6,-100],1e-9);
  assert.equal(r.bogies.length,8);for(const b of r.bogies){const t=plan.bogies.find(x=>x.name===b.name);assert.equal(b.level,t.level[6],b.name);near(b.distanceM,t.distanceM[6],1e-9,b.name);assert.equal(b.consistent,true);}
  near(r.cabDistanceM,plan.frames[6].cabDistanceM,1e-9);assert.deepEqual([r.clearance.ok,r.clearance.marginM,r.clearance.nearM],[true,.25,1]);
  let meshes=0;group.traverseVisible(o=>{if(o.isMesh&&o.geometry.attributes.position?.count)meshes++;});assert.equal(r.clearance.boxes,meshes,'a box for every mesh shown');assert.ok(meshes>20);
  assert.ok(r.clearance.minDistanceM>70,'in the seventh frame the tail is 78 m from the camera');
  const abreast=frame(0,undefined,'first');assert.equal(abreast.clearance.ok,true);assert.ok(abreast.clearance.minDistanceM>1.58&&abreast.clearance.minDistanceM<3.3,`abreast of the camera the nearest part is the side of the train, ${abreast.clearance.minDistanceM} m`);near(abreast.clearance.minDistanceM,3.3-f.half,.3);
  assert.equal(r.atmosphere,null);assert.deepEqual(r.chrome.visible,[]);assert.deepEqual(r.chrome.hidden.map(h=>h.name),page.chromeNames,'the chrome hidden so far');assert.ok(r.chrome.hidden.every(h=>h.drawn&&h.box.length===4));assert.equal(typeof r.trainNight,'number','the lamp level is read from the train material');
  // the margin is the one asked for: wider than the stage is long, nothing clears
  const wide=frame(6,{clearanceMarginM:500});assert.equal(wide.clearance.ok,false);assert.equal(wide.clearance.marginM,500);
  // a frame with fewer cars posed hides the others, and `isolate` afterwards restores THIS frame's cars, not the ones of an older snapshot
  frame(6);cat.isolate('empty');assert.equal(group.visible,false);cat.isolate('all');assert.deepEqual(group.children.map(o=>o.visible),[true,true,true,true]);
  const three=frame(6,{cars:poses.frames[6].cars.slice(0,3)});assert.deepEqual(three.cars.map(c=>c.visible),[true,true,true,false]);assert.equal(three.bogies.length,6,'a hidden car has no bogies to read');
  cat.isolate('empty');cat.isolate('all');assert.deepEqual(group.children.map(o=>o.visible),[true,true,true,false]);
  // the cars are read as they stand: turned and stretched too
  const bent=frame(6,{cars:poses.frames[6].cars.map(c=>({...c,scaleZ:1.002,rotationY:.01}))});assert.ok(bent.cars.length===4&&bent.cars.every(c=>Math.abs(c.scaleZ-1.002)<1e-12&&Math.abs(c.rotationY-.01)<1e-12),'each car\'s turn and stretch are what the page has');
  // a page that fails mid-frame still gets its flag back; one that moves the camera is stopped
  const was=page.window.__signalFrame;page.window.__signalFrame=()=>{throw new Error('render failed');};assert.throws(()=>cat.motionFrame(spec(6),'x'),/render failed/);assert.equal(page.info.autoReset,true);
  page.window.__signalFrame=()=>{page.camera.position.x+=.5;};assert.throws(()=>cat.motionFrame(spec(6),'x'),/moved the camera by 0\.5 m while rendering the frame/);page.window.__signalFrame=was;
  // a car that does not exist stops it; so does a bogie that does not
  assert.throws(()=>cat.motionFrame(spec(6,{cars:[{index:9,position:[0,0],rotationY:0,scaleZ:1,bogies:[]}]}),'x'),/the specimen has no car-9/);
  // chrome the page adds is hidden before the frame; chrome that cannot be hidden stops it
  const toast=new FakeEl('DIV',{className:'toast',rect:[600,500,300,40]});page.body.append(toast);const withToast=frame(6);assert.equal(toast.style.display,'none');assert.deepEqual(withToast.chrome.hidden.map(h=>h.name),[...page.chromeNames,'div.toast']);
  page.body.append(new FakeEl('DIV',{className:'stubborn',stubborn:true,rect:[0,0,50,50]}));assert.throws(()=>cat.motionFrame(spec(6),'x'),/page chrome would be in the picture: div\.stubborn at 0,0,50,50/);
  assert.equal(stop(),true);
 });
 assert.deepEqual(page.scene.children,before);assert.ok(page.scene.children.every(o=>o.visible),'the shed and the terrain are shown again');assert.equal(page.h1.style.display,'');assert.equal(page.label(),null);
});

// ---- the clip of one kind ----------------------------------------------------------------------------------------------------------------------
check('a clip on the stand-in page is 16 pictures with a sidecar each, a contact sheet and a report, and every bogie is read changing level once, at the frame the geometry predicts',async()=>{
 const plan=plans.get(KIND),f=formations.get(KIND);let checks=0;
 const run=await runClip({check:()=>{checks++;}}),{entry}=run;
 const frameFiles=Array.from({length:16},(_,i)=>frameFile(KIND,i+1));
 assert.deepEqual(run.order,[...frameFiles,`${KIND}-motion-sheet.png`,`${KIND}-motion.json`],'the pictures in order, then the sheet, then the report');assert.equal(checks,16,'the deadline is checked before every frame');
 assert.deepEqual([...run.published.keys()],frameFiles);assert.deepEqual([...run.written.keys()],[`${KIND}-motion-sheet.png`,`${KIND}-motion.json`]);
 // what the capture asked of the page: the stage, then for each frame the frame and the photographs, then the stage taken away
 assert.equal(run.log.length,2+16*4);assert.equal(run.log[0],`window.__cat.begin("${KIND}",${f.length},[-540,160])`);assert.equal(run.log.at(-1),'window.__cat.end()');
 run.log.slice(1,-1).forEach((e,i)=>assert.match(e,[/^window\.__cat\.motionFrame\(\{"camera":/,/^window\.__cat\.assertChrome\(\)$/,/^window\.__cat\.isolate\('empty'\)$/,/^window\.__cat\.isolate\('all'\)$/][i%4],`call ${i}`));
 assert.equal(run.shots,32,'a picture and its empty-stage baseline for each frame');
 assert.ok(run.log[1].includes('"clearanceMarginM":0.25')&&run.log[1].includes(`${KIND} motion M01 - frame 1/16 - 0 s, 0 m on - neutral-straight (scenery hidden)`));
 assert.ok(run.log[1+4*6].includes('frame 7/16 - 6 s, 120 m on - neutral-straight (scenery hidden)'));
 // the manifest entry
 assert.deepEqual([entry.id,entry.suffix],['M01','motion']);assert.deepEqual(entry.plan,F.motionPoseOf(plan));assert.equal(entry.notes,plan.notes);
 const o=entry.outcome;
 assert.deepEqual([o.status,o.reason,o.file,o.report,o.sheet,o.stage,o.trackLengthM,o.speedMps,o.stepS,o.frameCount],['OK',null,`${KIND}-motion.json`,`${KIND}-motion.json`,`${KIND}-motion-sheet.png`,'neutral-straight (scenery hidden)',700,20,1,16]);
 assert.deepEqual(o.frames,frameFiles.map((file,i)=>({index:i,number:i+1,status:'OK',reason:null,file})));
 assert.deepEqual(o.flips,plan.flips.map(x=>({name:x.name,firstFarIndex:x.firstFarIndex,plannedFirstFarIndex:x.firstFarIndex,equal:true})));
 // a sidecar: the usual one of a picture, and what makes it a frame of the clip
 const car=run.published.get(frameFile(KIND,7)).sidecar,fr=plan.frames[6],bogie=plan.bogies.find(b=>b.name==='bogie-2-0');
 assert.deepEqual([car.rubric,car.schema,car.kind,car.file],[F.CATALOGUE.rubric,'kx-catalogue-sidecar/1',KIND,frameFile(KIND,7)]);
 assert.deepEqual([car.view.id,car.view.suffix,car.view.frame,car.view.car,car.view.capability],['M01','motion-07','motion',null,null]);assert.deepEqual(car.view.notes.frame,{index:6,number:7,of:16,timeS:6,travelM:120,noseZ:fr.noseZ});assert.equal(car.view.notes.stage,'neutral-straight (scenery hidden)');
 assert.deepEqual(car.specimen,{groupWorldPosition:[0,0,0],rotationY:0,rotationRule:{rule:'none: the cars are posed along the path by carPoses and the specimen stays at the origin',rotationY:0}});
 vec(car.pose.trainLocal.eye,[-3.3,2.6,-fr.noseZ],1e-9);vec(car.pose.trainLocal.target,[-3.3,2.6,-100-fr.noseZ],1e-9);assert.deepEqual([car.pose.trainLocal.fov,car.pose.trainLocal.near,car.pose.trainLocal.up],[50,1,[0,1,0]]);
 vec(car.pose.world.position,[-3.3,2.6,0],1e-9);vec(car.pose.world.target,[-3.3,2.6,-100],1e-9);near(car.pose.world.positionErrorM,0,1e-9);
 assert.equal(car.label,`${KIND} motion M01 - frame 7/16 - 6 s, 120 m on - neutral-straight (scenery hidden)`);assert.equal(car.renderState.exposure,'day');assert.equal(car.stage.zRange[0],-540);assert.deepEqual(car.hiddenSceneNames,[{name:'terrain',type:'Group'},{name:'train-shed',type:'Group'}]);assert.deepEqual(car.hiddenDom,['h1','div.hud','div#almanac-back-host']);
 assert.equal(car.visibility.check,'near-plane clearance of the bounding box of every vertex');assert.equal(car.visibility.ok,true);assert.equal(car.pixels.ok,true);assert.equal(car.pixels.changedPixels,800);assert.deepEqual(car.formation.cars.length,4);
 const m=car.motion;assert.deepEqual([m.id,m.stage,m.trackLengthM,m.speedMps,m.stepS,m.lodDistanceM],['M01','neutral-straight (scenery hidden)',700,20,1,150]);assert.deepEqual(m.frame,{index:6,number:7,of:16,timeS:6,travelM:120,noseZ:fr.noseZ,middleZ:fr.middleZ,tailZ:fr.tailZ});
 near(m.cabDistanceM,fr.cabDistanceM,1e-9);assert.equal(m.plannedCabDistanceM,fr.cabDistanceM);assert.equal(m.bogies.length,8);assert.deepEqual(m.mismatches,[]);assert.deepEqual(m.problems,[]);assert.ok(m.maxDistanceErrorM<1e-9);assert.equal(m.clearance.ok,true);
 const row=m.bogies.find(b=>b.name==='bogie-2-0');assert.deepEqual([row.car,row.k,row.level,row.predictedLevel],[2,0,bogie.level[6],bogie.level[6]]);near(row.distanceM,bogie.distanceM[6],1e-9);assert.equal(row.inFrame,true);assert.ok(row.triangles>0);
 assert.equal(m.rendererInfo.renders,2);assert.deepEqual(car.costs.rendererInfo,m.rendererInfo);assert.deepEqual(car.costs.trainStatic,m.trainStatic);assert.equal(typeof m.baseTriangles,'number');assert.equal(car.timings.read,1,'timings come from the clock it is given');
 // a sidecar is a different picture of the same train in every frame
 const e1=run.published.get(frameFile(KIND,1)).sidecar,e16=run.published.get(frameFile(KIND,16)).sidecar;assert.notDeepEqual(e1.motion.frame,e16.motion.frame);assert.equal(e1.view.suffix,'motion-01');assert.equal(e16.view.suffix,'motion-16');
 assert.ok(e1.motion.trainStatic.triangles>e16.motion.trainStatic.triangles,'the train draws fewer triangles once its bogies are bare');
 assert.notEqual(sha(run.published.get(frameFile(KIND,1)).bytes),sha(run.published.get(frameFile(KIND,2)).bytes));
 // the report
 assert.ok(run.written.get(`${KIND}-motion.json`).toString('utf8').endsWith('}\n'),'the report file ends with a newline');const report=JSON.parse(run.written.get(`${KIND}-motion.json`).toString('utf8'));
 assert.deepEqual([report.rubric,report.schema,report.kind,report.id,report.status,report.reason],[F.CATALOGUE.rubric,'kx-catalogue-motion/1',KIND,'M01','OK',null]);
 assert.deepEqual([report.stage,report.trackLengthM,report.speedMps,report.stepS,report.frameCount,report.travelM,report.lodDistanceM],['neutral-straight (scenery hidden)',700,20,1,16,300,150]);assert.equal(report.rule,F.MOTION_RULE);assert.equal(report.stationScene,F.MOTION_STATION_NOTE);
 assert.deepEqual(report.camera,plan.camera);assert.deepEqual(report.clip,plan.clip);assert.equal(report.formation.lengthM,f.length);assert.equal(report.formation.cars.length,4);assert.equal(report.renderer,session.renderer);assert.equal(report.exposure,'day');
 assert.deepEqual([report.flips.bogies,report.flips.allEqual,report.flips.minBoundaryMarginM,report.flips.mismatches],[8,true,plan.checks.minBoundaryMarginM,[]]);assert.ok(report.flips.maxDistanceErrorM<1e-9);
 assert.equal(report.bogies.length,8);
 for(const b of report.bogies) {
  const t=plan.bogies.find(x=>x.name===b.name),p=plan.flips.find(x=>x.name===b.name);
  assert.deepEqual([b.car,b.k,b.zM,b.plannedFirstFarIndex,b.firstFarIndex,b.equal],[t.car,t.k,t.z,p.firstFarIndex,p.firstFarIndex,true],b.name);
  assert.ok(b.near.triangles>b.far.triangles&&b.far.triangles>0,`${b.name} costs less bare`);assert.deepEqual([b.near.drawCalls,b.far.drawCalls],[1,1]);
  assert.deepEqual(b.level,t.level);b.distanceM.forEach((d,i)=>near(d,t.distanceM[i],1e-9));assert.deepEqual(b.plannedDistanceM,t.distanceM);
  // the pair of pictures either side of the flip
  assert.deepEqual([b.lastNear.index,b.lastNear.number,b.lastNear.file,b.lastNear.status],[p.firstFarIndex-1,p.firstFarIndex,frameFile(KIND,p.firstFarIndex),'OK']);near(b.lastNear.distanceM,p.nearDistanceM,1e-9);
  assert.deepEqual([b.firstFar.index,b.firstFar.number,b.firstFar.file,b.firstFar.status],[p.firstFarIndex,p.firstFarIndex+1,frameFile(KIND,p.firstFarIndex+1),'OK']);near(b.firstFar.distanceM,p.farDistanceM,1e-9);
 }
 assert.equal(report.costs.baseTrianglesEqual,true);assert.equal(typeof report.costs.baseTriangles,'number');
 assert.deepEqual([report.costs.allNear.index,report.costs.allBare.index],[0,15]);
 assert.equal(report.costs.savedTriangles,report.bogies.reduce((n,b)=>n+b.near.triangles-b.far.triangles,0),'the saving is the near and far cost of each bogie');assert.equal(report.costs.savedDrawCalls,0);
 assert.equal(report.costs.allNear.triangles,report.costs.baseTriangles+report.bogies.reduce((n,b)=>n+b.near.triangles,0),'every bogie full, plus the rest of the train');assert.equal(report.costs.allBare.triangles,report.costs.baseTriangles+report.bogies.reduce((n,b)=>n+b.far.triangles,0));
 assert.equal(report.costs.perFrame.length,16);assert.match(report.costs.note,/static counter/);
 assert.equal(report.frames.length,16);report.frames.forEach((x,i)=>{assert.deepEqual([x.index,x.number,x.file,x.status,x.reason,x.problems],[i,i+1,frameFile(KIND,i+1),'OK',null,[]]);assert.equal(x.noseZ,plan.frames[i].noseZ);assert.equal(x.travelM,plan.frames[i].travelM);assert.deepEqual(x.bogieLevels,plan.bogies.map(b=>b.level[i]));assert.equal(x.clearance.ok,true);assert.equal(x.pixels.ok,true);near(x.cabDistanceReadM,plan.frames[i].cabDistanceM,1e-9);});
 assert.deepEqual(report.checks.poses.route,{points:15,edges:14,lengthM:700});assert.ok(report.checks.poses.maxErrorM<1e-9);assert.deepEqual(report.checks.clearance,plan.clearance);assert.equal(report.checks.stageSlackM,plan.checks.stageSlackM);
 assert.equal(report.sheet.file,`${KIND}-motion-sheet.png`);assert.deepEqual([report.sheet.columns,report.sheet.tileWidth,report.sheet.tileHeight,report.sheet.gap,report.sheet.rows],[4,400,250,8,4]);assert.match(report.sheet.ticks,/orange square/);
 assert.deepEqual(report.hiddenSceneNames,[{name:'terrain',type:'Group'},{name:'train-shed',type:'Group'}]);assert.deepEqual(report.stageLevels.zRange,[-540,160]);
 // the contact sheet: each frame in its place, with an orange tick for every bogie first bare there
 const sheet=sheetOf(run);assert.deepEqual([sheet.width,sheet.height],[1640,1040]);
 for(let i=0;i<16;i++) {
  const [x0,y0]=tileOrigin(i),n=i+1;
  assert.deepEqual(px(sheet,x0+20+n*20+10,y0+110),frameColour(n),`tile ${i} shows picture ${n}`);assert.deepEqual(px(sheet,x0+5,y0+110),BACKGROUND,`tile ${i} background`);
  const ticks=plan.flips.filter(x=>x.firstFarIndex===i).length;
  for(let t=0;t<4;t++)assert.deepEqual(px(sheet,x0+4+t*14+5,y0+4+5),t<ticks?[255,140,0]:BACKGROUND,`tile ${i} tick ${t}`);
 }
 assert.equal(plan.flips.length,8);assert.equal(Math.max(...plan.flips.map(x=>x.firstFarIndex))-Math.min(...plan.flips.map(x=>x.firstFarIndex)),4,'the flips of this kind are spread over five frames');
 // the same clip again is the same bytes
 const again=await runClip();
 assert.deepEqual([...again.published].map(([file,{bytes}])=>[file,sha(bytes)]),[...run.published].map(([file,{bytes}])=>[file,sha(bytes)]));assert.deepEqual([...again.written].map(([file,bytes])=>[file,sha(bytes)]),[...run.written].map(([file,bytes])=>[file,sha(bytes)]));
 assert.deepEqual([...again.published.values()].map(v=>v.sidecar),[...run.published.values()].map(v=>v.sidecar));assert.deepEqual(again.entry,run.entry);
});

check('a page whose bogies change level at another distance than the geometry says makes the clip a GAP with the readings that differ, and keeps the pictures as the evidence of what it drew',async()=>{
 const page=motionPage({beforeRender:[scene=>scene.traverse(o=>{if(o.isLOD)o.levels[1].distance=100;})]}),plan=plans.get(KIND);
 const run=await runClip({page}),o=run.entry.outcome;
 assert.equal(o.status,'GAP');assert.equal(o.file,null,'a GAP clip has no OK report');assert.equal(o.report,`${KIND}-motion.json`);assert.equal(o.sheet,`${KIND}-motion-sheet.png`);
 assert.match(o.reason,/^\d+ reading\(s\) differ from the schedule predicted from the geometry: frame 1 bogie-0-0 level table; frame 1 bogie-0-1 level table; frame 1 bogie-1-0 level table/);
 assert.ok(o.frames.every(x=>x.status==='OK'&&x.file),'the pictures stand');assert.equal(run.published.size,16);
 assert.ok(o.flips.some(x=>!x.equal&&x.firstFarIndex<x.plannedFirstFarIndex),'the bogies went bare earlier than planned');assert.ok(o.flips.every(x=>x.firstFarIndex!==null));
 const report=JSON.parse(run.written.get(`${KIND}-motion.json`).toString('utf8'));assert.equal(report.status,'GAP');assert.equal(report.reason,o.reason);assert.equal(report.flips.allEqual,false);assert.ok(report.flips.mismatches.length>=8);
 assert.deepEqual(report.bogies.map(b=>b.plannedFirstFarIndex),plan.flips.map(x=>x.firstFarIndex),'each bogie\'s line keeps the frame the geometry predicted');assert.ok(report.bogies.every(b=>b.firstFarIndex!==null&&b.firstFarIndex<=b.plannedFirstFarIndex)&&report.bogies.some(b=>b.firstFarIndex<b.plannedFirstFarIndex),'and the frame it was read at, which is earlier here');
 assert.ok(report.flips.mismatches.some(m=>m.why==='level'),'a level other than predicted is named');assert.ok(report.bogies.some(b=>b.equal===false));
 const sidecar=run.published.get(frameFile(KIND,1)).sidecar;assert.equal(sidecar.motion.mismatches.length,8,'every bogie has a level table of 100 m');assert.ok(sidecar.motion.mismatches.every(x=>x.why==='level table'));
 assert.equal(plan.status,'OK');
});

check('the sidecar of a frame carries what its judgement found, whatever that was: the mismatches, the problems and the largest distance error, with the numbers of the frame',()=>{
 const plan=plans.get(KIND),frame=plan.frames[4],formation=formations.get(KIND);
 const read={pose:{position:[-3.3,2.6,0],target:[-3.3,2.6,-100],fov:50,aspect:1.6,near:1,far:9000,up:[0,1,0],positionErrorM:0},placement:{position:[0,0,0],rotationY:0},cabDistanceM:44.5,info:{calls:30,triangles:1234,renders:2},
  costs:{triangles:617,drawCalls:15},clearance:{ok:true,reason:null},labelText:'x',chrome:{hidden:[],visible:[]},atmosphere:null,trainNight:0};
 const judged={rows:[{name:'bogie-0-0',level:0}],mismatches:[{frame:4,bogie:'bogie-0-0',why:'level'}],problems:['car-1 is not where the capture put it','the page reports bogie-9-9, which the plan has not'],baseTriangles:517,maxDistanceErrorM:3e-7};
 const sc=safely(()=>C.motionSidecar({kind:KIND,plan,frame,file:`${KIND}-motion-05.png`,formation,session,host,build,state:{hidden:[],hiddenDom:[],stage:{}},read,judged,verdict:{ok:true},timings:{total:1}}));
 assert.deepEqual(sc.motion.problems,judged.problems);assert.deepEqual(sc.motion.mismatches,judged.mismatches);assert.equal(sc.motion.maxDistanceErrorM,3e-7);assert.deepEqual(sc.motion.bogies,judged.rows);assert.equal(sc.motion.baseTriangles,517);
 assert.equal(sc.motion.cabDistanceM,44.5);assert.equal(sc.motion.plannedCabDistanceM,frame.cabDistanceM);assert.deepEqual(sc.motion.rendererInfo,read.info);assert.deepEqual(sc.motion.trainStatic,read.costs);assert.deepEqual(sc.motion.clearance,read.clearance);
 assert.deepEqual([sc.motion.frame.index,sc.motion.frame.number,sc.motion.frame.of,sc.motion.frame.timeS,sc.motion.frame.travelM,sc.motion.frame.noseZ,sc.motion.frame.middleZ,sc.motion.frame.tailZ],[4,5,16,frame.timeS,frame.travelM,frame.noseZ,frame.middleZ,frame.tailZ]);
 assert.deepEqual([sc.motion.id,sc.motion.stage,sc.motion.trackLengthM,sc.motion.speedMps,sc.motion.stepS,sc.motion.lodDistanceM],[F.MOTION.id,F.MOTION_STAGE,700,20,1,150]);assert.equal(sc.view.suffix,'motion-05');assert.equal(sc.file,`${KIND}-motion-05.png`);
 // the page adds some scene children as it finishes loading, so the order it reports them in changes from run to run; the sidecar lists them in a fixed order
 const hidden=[{name:'terrain',type:'Group'},{name:'ole',type:'Mesh'},{name:'portals',type:'Group'},{name:'ole',type:'Group'},{name:'',type:'Mesh'}],before=structuredClone(hidden);
 const shuffled=safely(()=>C.motionSidecar({kind:KIND,plan,frame,file:`${KIND}-motion-05.png`,formation,session,host,build,state:{hidden,hiddenDom:[],stage:{}},read,judged,verdict:{ok:true},timings:{total:1}}));
 assert.deepEqual(shuffled.hiddenSceneNames,[{name:'',type:'Mesh'},{name:'ole',type:'Group'},{name:'ole',type:'Mesh'},{name:'portals',type:'Group'},{name:'terrain',type:'Group'}]);assert.deepEqual(hidden,before,'the list the page gave is not reordered');
 const reversed=safely(()=>C.motionSidecar({kind:KIND,plan,frame,file:`${KIND}-motion-05.png`,formation,session,host,build,state:{hidden:[...hidden].reverse(),hiddenDom:[],stage:{}},read,judged,verdict:{ok:true},timings:{total:1}}));
 assert.deepEqual(reversed.hiddenSceneNames,shuffled.hiddenSceneNames,'the same list in the other order gives the same sidecar');
});

check('the hidden scene children are sorted by name and then by type, in a copy',()=>{
 const given=[{name:'b',type:'Mesh'},{name:'a',type:'Mesh'},{name:'b',type:'Group'},{name:'a',type:'Group'},{name:'B',type:'Group'}],frozen=Object.freeze([...given]);
 const sorted=safely(()=>C.sortedObjects(frozen));
 assert.deepEqual(sorted,[{name:'B',type:'Group'},{name:'a',type:'Group'},{name:'a',type:'Mesh'},{name:'b',type:'Group'},{name:'b',type:'Mesh'}],'code-point order of the name, then of the type');
 assert.notEqual(sorted,frozen);assert.deepEqual([...frozen],given,'the list given is left as it was');assert.deepEqual(C.sortedObjects([]),[]);
});

check('the report of a kind names the classes it stands for and what the model cannot tell apart, as the sidecars do',async()=>{
 const kind='lner5',formation=formations.get(kind),run=await runClip({kind}),report=JSON.parse(run.written.get(`${kind}-motion.json`).toString('utf8'));
 assert.equal(typeof formation.classNote,'string','the LNER kinds carry a note that states the class');assert.ok(formation.classNote.length>20&&formation.classes.length>3);assert.match(formation.classNote,/^stated class: the electric Class 801\/1 \(five cars\)\./,'the five-car kind is the 801/1');
 assert.equal(report.formation.classes,formation.classes);assert.equal(report.formation.classNote,formation.classNote);assert.equal(report.formation.lengthM,formation.length);assert.equal(report.formation.cars.length,5);
 const sidecar=run.published.get(frameFile(kind,1)).sidecar;assert.equal(sidecar.formation.classes,formation.classes);assert.equal(sidecar.formation.classNote,formation.classNote);
});

check('a frame in which the page draws no train is a GAP with the reason, not a picture and not a quiet pass; the sheet shows a grey tile where it was',async()=>{
 const plan=plans.get(KIND),run=await runClip({page:motionPage({blank:[9]})}),o=run.entry.outcome,reason='picture shows no specimen: only 0 pixels differ from the empty stage (need 30)';
 assert.equal(o.status,'GAP');assert.equal(o.reason,`1 frame(s) are GAP: frame 9 ${reason}`);assert.deepEqual(o.frames[8],{index:8,number:9,status:'GAP',reason,file:null});assert.equal(o.file,null);assert.equal(o.report,`${KIND}-motion.json`);
 assert.equal(run.published.size,15);assert.ok(!run.published.has(frameFile(KIND,9)));assert.equal(run.order.filter(f=>f.endsWith('.png')).length,16,'15 pictures and the sheet');
 assert.equal(run.shots,32,'the frame was photographed, found empty and not published');
 const report=JSON.parse(run.written.get(`${KIND}-motion.json`).toString('utf8'));assert.deepEqual([report.frames[8].status,report.frames[8].reason,report.frames[8].file,report.frames[8].pixels.ok],['GAP',reason,null,false]);assert.equal(report.status,'GAP');
 assert.equal(report.flips.allEqual,true,'the readings of the frame were right; only the picture is missing');assert.equal(report.frames[8].problems.length,0);
 const sheet=sheetOf(run),[x0,y0]=tileOrigin(8),[x7,y7]=tileOrigin(7);assert.deepEqual(px(sheet,x0+200,y0+125),[128,128,128]);assert.deepEqual(px(sheet,x0+399,y0+249),[128,128,128]);assert.deepEqual(px(sheet,x7+20+8*20+10,y7+110),frameColour(8),'the frame before it is a picture');
 // the bogies that first go bare in the frame that has no picture are still ticked on its grey tile
 const ticks=plan.flips.filter(x=>x.firstFarIndex===8).length;assert.ok(ticks>0,'this kind has a flip at frame 9');for(let t=0;t<ticks;t++)assert.deepEqual(px(sheet,x0+4+t*14+5,y0+9),[255,140,0]);
 // a clip in which no frame is a picture has no sheet
 const none=await runClip({page:motionPage({blank:Array.from({length:16},(_,i)=>i+1)})});assert.equal(none.entry.outcome.sheet,null);assert.equal(none.written.has(`${KIND}-motion-sheet.png`),false);assert.equal(none.published.size,0);assert.ok(none.written.has(`${KIND}-motion.json`));assert.equal(none.entry.outcome.status,'GAP');assert.equal(none.entry.outcome.report,`${KIND}-motion.json`);
});

check('a frame in which the train cuts the near plane is a GAP with the reason and is not photographed',async()=>{
 const plan=plans.get(KIND),zero=-plan.frames[3].noseZ;
 // a plank on car 2, 0.5 m from the camera's line when the frame is the fourth, and 20 m or more away in every other
 const page=motionPage({decorate:g=>{const plank=new T.Mesh(new T.BoxGeometry(.2,.2,.2),new T.MeshBasicMaterial());plank.name='plank';plank.position.set(-2.8,2.6,zero);g.getObjectByName('car-2').add(plank);return g;}});
 const run=await runClip({page}),o=run.entry.outcome;
 assert.match(o.frames[3].reason,/^the near plane \(near 1 m, clip radius 1\.332 m, margin 0\.25 m\) is cut by 1 bounding box\(es\), the nearest car-2\/plank at 0\.4\d\d m$/);
 assert.deepEqual([o.frames[3].status,o.frames[3].file,o.frames[2].status,o.frames[4].status],['GAP',null,'OK','OK']);assert.equal(o.status,'GAP');assert.match(o.reason,/^1 frame\(s\) are GAP: frame 4 the near plane \(near 1 m, clip radius 1\.332 m, margin 0\.25 m\) is cut by 1 bounding box/);
 assert.equal(run.published.size,15);assert.equal(run.shots,30,'the clipped frame was never photographed');assert.equal(run.log.length,2+16+15*3,'it is one call, the frame itself: no chrome check, no baseline');
 assert.match(run.log[1+4*3],/^window\.__cat\.motionFrame\(/);assert.match(run.log[1+4*3+1],/^window\.__cat\.motionFrame\(/,'the frame after it follows at once');
 const report=JSON.parse(run.written.get(`${KIND}-motion.json`).toString('utf8'));assert.equal(report.frames[3].clearance.ok,false);assert.equal(report.frames[3].clearance.violationCount,1);assert.equal(report.frames[3].pixels,null);assert.equal(report.frames[2].clearance.ok,true);
 assert.equal(report.flips.allEqual,true,'the readings of every frame, the clipped one included, are the geometry\'s');
});

check('a frame in which the page is not as it was asked to be is a GAP with the reason and is not photographed',async()=>{
 // the page hides car 1 in the fifth frame
 const page=motionPage({beforeRender:[scene=>{if(/ - frame 5\//.test(page.label()?.textContent??''))scene.getObjectByName('car-1').visible=false;}]});
 const run=await runClip({page}),o=run.entry.outcome,reason='the page reports no bogie-1-0; the page reports no bogie-1-1; car-1 is not where the capture put it';
 assert.deepEqual(o.frames[4],{index:4,number:5,status:'GAP',reason,file:null});assert.equal(o.frames.filter(x=>x.status==='OK').length,15);
 assert.equal(o.status,'GAP');assert.ok(o.reason.startsWith(`1 frame(s) are GAP: frame 5 ${reason}`),o.reason);
 assert.equal(run.published.size,15);assert.equal(run.shots,30);assert.equal(run.log.length,2+16+15*3);
 const report=JSON.parse(run.written.get(`${KIND}-motion.json`).toString('utf8'));assert.deepEqual(report.frames[4].problems,['the page reports no bogie-1-0','the page reports no bogie-1-1','car-1 is not where the capture put it']);assert.equal(report.frames[4].pixels,null);assert.equal(report.flips.allEqual,false);
 // more problems than are listed: the first three are the reason, all of them are in the report
 const two=motionPage({beforeRender:[scene=>{if(/ - frame 5\//.test(two.label()?.textContent??'')){scene.getObjectByName('car-1').visible=false;scene.getObjectByName('car-2').visible=false;}}]});
 const many=await runClip({page:two}),m=many.entry.outcome.frames[4];
 assert.equal(m.reason,'the page reports no bogie-1-0; the page reports no bogie-1-1; the page reports no bogie-2-0','four bogies are missing and three are listed');
 const full=JSON.parse(many.written.get(`${KIND}-motion.json`).toString('utf8')).frames[4].problems;assert.equal(full.length,6,'four bogies and two cars');assert.deepEqual(full.slice(0,3),m.reason.split('; '));
});

check('a thrown error in the page stops the clip and the stage is still taken away; a deadline is checked before each frame',async()=>{
 {
  const page=motionPage({decorate:g=>{g.remove(g.getObjectByName('car-3'));return g;}}),before=page.scene.children.slice(),log=[];
  await assert.rejects(runClip({page,log}),/the specimen has no car-3/);
  assert.equal(log.length,3);assert.match(log[0],/^window\.__cat\.begin\(/);assert.match(log[1],/^window\.__cat\.motionFrame\(/);assert.equal(log[2],'window.__cat.end()');
  assert.deepEqual(page.scene.children,before);assert.ok(page.scene.children.every(o=>o.visible));assert.equal(page.label(),null);assert.equal(page.window.__cat.state,null,'nothing is left on stage');
 }
 {
  let n=0;const page=motionPage(),before=page.scene.children.slice(),log=[];
  await assert.rejects(runClip({page,log,check:()=>{if(++n===3)throw new Error('deadline');}}),/deadline/);
  assert.equal(n,3);assert.equal(log.length,2+4*2,'two frames, then the stage taken away');assert.equal(log.at(-1),'window.__cat.end()');assert.deepEqual(page.scene.children,before);assert.equal(page.window.__cat.state,null);
 }
});

check('a plan that is a GAP, or whose poses the geometry does not vouch for, is recorded without touching the page',async()=>{
 const f=formations.get(KIND),gapPlan=F.planMotion(f,{frames:11}),log=[];
 assert.equal(gapPlan.status,'GAP');
 const run=await runClip({plan:gapPlan,log});
 assert.deepEqual(log,[]);assert.equal(run.published.size+run.written.size,0);assert.equal(run.shots,0);
 assert.deepEqual(run.entry.outcome,{status:'GAP',reason:'the clip has 11 frames, fewer than 12',file:null,report:null,sheet:null,stage:'neutral-straight (scenery hidden)',trackLengthM:700,speedMps:20,stepS:1,frameCount:11,frames:[],flips:[]});
 assert.deepEqual(run.entry.plan,F.motionPoseOf(gapPlan));
 // a plan whose bogies the carPoses of the page does not put where the plan says
 const tampered=structuredClone(plans.get(KIND));tampered.bogies[3].z+=1;const bad=await runClip({plan:tampered,log});
 assert.deepEqual(log,[]);assert.equal(bad.entry.outcome.status,'GAP');assert.match(bad.entry.outcome.reason,/^the page's placement code \(carPoses\) disagrees with the geometry: frame 1: carPoses puts bogie-1-1 at z -?[\d.]+ \(x 0\), the geometry says z -?[\d.]+; frame 2: /);
 assert.equal(bad.entry.outcome.reason.split('; ').length,3,'sixteen frames disagree and three are listed');
 assert.deepEqual([bad.entry.outcome.file,bad.entry.outcome.report,bad.entry.outcome.sheet,bad.entry.outcome.frames,bad.entry.outcome.flips],[null,null,null,[],[]]);assert.equal(bad.published.size+bad.written.size,0);
});

// ---- the manifest, argv and the frozen poses ---------------------------------------------------------------------------------------------------
check('the manifest names the clip once, and a kind\'s entry carries its frozen plan, the outcome and where the files are',()=>{
 const head=C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,motion:true,generated:'2026-11-09T00:00:00Z'});
 assert.deepEqual(head.motion,{id:'M01',suffix:'motion',stage:'neutral-straight (scenery hidden)',rule:F.MOTION_RULE,stationScene:F.MOTION_STATION_NOTE,speedMps:20,stepS:1,frames:16,trackLengthM:700,zRange:[-540,160],lodDistanceM:150,lateralM:3.3,sheet:F.MOTION.sheet,exposure:'day'});
 assert.deepEqual(C.motionManifest(),head.motion);assert.ok(!('motion' in C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,generated:'2026-11-09T00:00:00Z'})),'a run without M01 says nothing of it');
 assert.ok(!('motion' in C.catalogueManifest({exposure:'day',stationScene:null,host,build,poses:null,motion:false,generated:'x'})));
 const plan=plans.get('lner5'),frames=[{index:0,number:1,status:'OK',reason:null,file:'lner5-motion-01.png',extra:1},{index:1,number:2,status:'GAP',reason:'r',file:null}],flips=[{name:'bogie-0-0',firstFarIndex:5,plannedFirstFarIndex:5,equal:true,nearToFar:1}];
 const ok=C.motionManifestEntry(plan,{status:'OK',reason:null,report:'lner5-motion.json',sheet:'lner5-motion-sheet.png',frames,flips});
 assert.deepEqual(ok,{id:'M01',suffix:'motion',plan:F.motionPoseOf(plan),notes:plan.notes,outcome:{status:'OK',reason:null,file:'lner5-motion.json',report:'lner5-motion.json',sheet:'lner5-motion-sheet.png',stage:'neutral-straight (scenery hidden)',trackLengthM:700,speedMps:20,stepS:1,frameCount:16,
  frames:[{index:0,number:1,status:'OK',reason:null,file:'lner5-motion-01.png'},{index:1,number:2,status:'GAP',reason:'r',file:null}],flips:[{name:'bogie-0-0',firstFarIndex:5,plannedFirstFarIndex:5,equal:true}]}});
 const gap=C.motionManifestEntry(plan,{status:'GAP',reason:'why',report:'lner5-motion.json',sheet:null,frames,flips});assert.deepEqual([gap.outcome.status,gap.outcome.reason,gap.outcome.file,gap.outcome.report,gap.outcome.sheet],['GAP','why',null,'lner5-motion.json',null]);
 const bare=C.motionManifestEntry(plan,{status:'GAP'});assert.deepEqual([bare.outcome.reason,bare.outcome.file,bare.outcome.report,bare.outcome.sheet,bare.outcome.frames,bare.outcome.flips],[null,null,null,null,[],[]]);
 assert.equal(C.motionManifestEntry(plan,{status:'OK'}).outcome.file,null,'an OK clip without a report names no file');
});

check('--views takes M01 as an opt-in: the default views stay V01-V10, the clip is taken at day only, and it is listed last',()=>{
 const base=['--mode','catalogue','--dist','d','--out','o'],parse=extra=>safely(()=>C.parseCatalogueArgs([...base,...extra])),refuse=(extra,pattern,note)=>assert.throws(()=>C.parseCatalogueArgs([...base,...extra]),pattern,note);
 assert.deepEqual(parse([]).views,F.VIEW_IDS);assert.ok(!parse([]).views.includes('M01'));assert.deepEqual(parse(['--views','M01']).views,['M01']);assert.deepEqual(parse(['--views','M01,V04']).views,['V04','M01']);assert.deepEqual(parse(['--views','V10,M01,V01']).views,['V01','V10','M01']);
 assert.deepEqual(parse(['--views','M01','--exposure','day']).views,['M01']);assert.deepEqual(parse(['--views','V01','--exposure','dusk']).views,['V01'],'a dusk pass of the other views is as it was');assert.deepEqual(parse(['--exposure','dusk']).views,F.VIEW_IDS);
 refuse(['--views','M01','--exposure','dusk'],/--views M01: the motion clip is taken at day only, not dusk/);refuse(['--views','V01,M01','--exposure','dusk'],/the motion clip is taken at day only, not dusk/);
 refuse(['--views','M02'],/--views: unknown M02; expected V01,V02,V03,V04,V05,V06,V07,V08,V09,V10,M01/);refuse(['--views','M01,M01'],/--views: M01 repeated/);refuse(['--views','m01'],/unknown m01/);
 refuse(['--kinds','M01'],/--kinds: unknown M01/,'the kinds are still the kinds');
});

check('catalogue preflight plans the clip without Chrome, one OK clip per kind, and a held manifest of an earlier round does not refuse it',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/train-motion-test-'),log=console.log;
 try {
  const dist=path.join(dir,'dist'),out=path.join(dir,'out');await mkdir(dist);
  const run=async(...args)=>{const lines=[];console.log=(...a)=>lines.push(a.join(' '));try{await C.catalogueMain(['--mode','catalogue','--dist',dist,'--out',out,'--chrome','none',...args]);}finally{console.log=log;}return lines.map(l=>JSON.parse(l));};
  const ok=async(...args)=>{try{return await run(...args);}catch(e){assert.fail(`catalogueMain threw: ${e?.message}`);}};
  const [one]=await ok('--kinds','lner5,gn387x12','--views','M01');assert.deepEqual([one.catalogue,one.kinds,one.views,one.posesFrozen,one.exposure],[true,['lner5','gn387x12'],['M01'],false,'day']);assert.deepEqual(one.planned,{lner5:{OK:1},gn387x12:{OK:1}});
  const [all]=await ok('--views','M01');assert.deepEqual(all.planned,Object.fromEntries(ALL_KINDS.map(kind=>[kind,{OK:1}])));
  const [dflt]=await ok('--kinds','lner5');assert.deepEqual(dflt.views,F.VIEW_IDS);
  const [v2]=await ok('--kinds','lner5','--views','V02'),[both]=await ok('--kinds','lner5','--views','V02,M01');
  assert.deepEqual(both.planned.lner5,{...v2.planned.lner5,OK:v2.planned.lner5.OK+1},'the clip adds one OK to the views beside it');assert.deepEqual(both.views,['V02','M01']);
  const [v10]=await ok('--kinds','lner5','--views','V10'),[v10m]=await ok('--kinds','lner5','--views','V10,M01');assert.deepEqual(v10m.planned.lner5,{OK:v10.planned.lner5.OK+1});
  // a manifest of an earlier round has no clip: it must neither refuse a run that asks for the clip nor be changed by it
  const poses=path.join(dir,'manifest.json'),earlier={rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:{lner5:{views:{}},gn387x12:{views:{}}}};
  const plansOf=kind=>F.planCatalogueViews(formations.get(kind));
  for(const kind of ['lner5','gn387x12'])earlier.kinds[kind].views=Object.fromEntries(plansOf(kind).map(v=>[v.suffix,{plan:JSON.parse(JSON.stringify(F.poseOf(v)))}]));
  await writeFile(poses,JSON.stringify(earlier));
  const [frozen]=await ok('--kinds','lner5,gn387x12','--views','M01','--poses',poses);assert.equal(frozen.posesFrozen,true);assert.deepEqual(frozen.planned,{lner5:{OK:1},gn387x12:{OK:1}});
  const [mixed]=await ok('--kinds','lner5','--views','V01,M01','--poses',poses);assert.equal(mixed.posesFrozen,true);
  await assert.rejects(run('--kinds','lner5','--views','M01','--exposure','dusk','--poses',poses),/--views M01: the motion clip is taken at day only, not dusk/);
  // a manifest that does have a clip, planned differently, refuses
  const moved=JSON.parse(JSON.stringify(earlier));moved.kinds.lner5.views.motion={plan:JSON.parse(JSON.stringify(F.motionPoseOf(plans.get('lner5'))))};moved.kinds.lner5.views.motion.plan.camera.eye[0]=-3.4;await writeFile(poses,JSON.stringify(moved));
  await assert.rejects(run('--kinds','lner5','--views','M01','--poses',poses),/refusing to capture: 1 pose\(s\) differ from .*lner5\/motion motion plan differs from the frozen plan at \/camera\/eye\/0/);
  const [skip]=await ok('--kinds','lner5','--views','V01','--poses',poses);assert.equal(skip.posesFrozen,true,'a run that does not ask for the clip does not compare it');
 } finally {console.log=log;await rm(dir,{recursive:true,force:true});}
});

check('the frozen plan of a clip is compared when both have one, within a tolerance, and an earlier round\'s manifest without one leaves nothing to drift from',()=>{
 const kinds=['lner5','gn387x8'],mapOf=ks=>new Map(ks.map(kind=>[kind,{kind,views:[],motion:plans.get(kind)}]));
 const manifest=ks=>JSON.parse(JSON.stringify({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:Object.fromEntries(ks.map(kind=>[kind,{views:{motion:{plan:F.motionPoseOf(plans.get(kind))}}}]))}));
 const drift=(change,tol)=>{const m=manifest(kinds);change(m.kinds.lner5.views.motion.plan);return drifts(C.loadFrozenPoses(JSON.stringify(m)),mapOf(kinds),tol===undefined?{}:{tol});};
 const at=(change,tol)=>drift(change,tol)[0]?.at;
 // what a frozen clip plan is: the status, the length, the camera, the clip and the frame each bogie goes bare at
 const frozen=manifest(kinds).kinds.lner5.views.motion.plan;
 assert.deepEqual(Object.keys(frozen),['status','lengthM','camera','clip','flips']);assert.equal(frozen.status,'OK');assert.equal(frozen.lengthM,formations.get('lner5').length);assert.deepEqual(frozen.camera.eye,[-3.3,2.6,0]);assert.equal(frozen.clip.speedMps,20);assert.equal(frozen.flips.length,10);assert.deepEqual(frozen.flips[0],['bogie-0-0',plans.get('lner5').flips[0].firstFarIndex]);
 assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(manifest(kinds))),mapOf(kinds)),[],'a clip planned again matches the one it froze, through a JSON round trip');
 const d=drift(p=>{p.flips[0][1]+=1;});assert.deepEqual(d,[{kind:'lner5',view:'motion',reason:'motion plan differs from the frozen plan',at:'/flips/0/1'}]);
 assert.equal(at(p=>{p.camera.eye[0]-=.001;}),'/camera/eye/0');assert.equal(at(p=>{p.clip.speedMps=21;}),'/clip/speedMps');assert.equal(at(p=>{p.status='GAP';}),'/status');assert.equal(at(p=>{p.lengthM+=.01;}),'/lengthM');
 assert.equal(at(p=>{p.flips[3][0]='bogie-9-9';}),'/flips/3/0');assert.equal(at(p=>{p.clip.zRange[1]=150;}),'/clip/zRange/1');
 assert.deepEqual(drift(p=>{p.camera.eye[0]-=1e-9;}),[],'a nanometre is inside the tolerance');assert.deepEqual(drift(p=>{p.camera.eye[0]-=.001;},.01),[],'a wider tolerance accepts it');assert.equal(at(p=>{p.camera.eye[0]-=1e-9;},1e-12),'/camera/eye/0');
 // nothing to compare: no frozen clip, a frozen entry without a plan, or a run that does not plan the clip
 const earlier=JSON.parse(JSON.stringify({rubric:F.CATALOGUE.rubric,schema:'kx-catalogue-manifest/1',kinds:{lner5:{views:{}},gn387x8:{views:{'front-3m':{plan:{}}}}}}));
 assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(earlier)),mapOf(kinds)),[],'the manifest of a round before the clip existed');
 const noPlan=manifest(kinds);delete noPlan.kinds.lner5.views.motion.plan;assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(noPlan)),mapOf(kinds)),[]);
 const without=new Map(kinds.map(kind=>[kind,{kind,views:[],motion:null}]));assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(manifest(kinds))),without),[]);
 assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(manifest(['lner5']))),mapOf(kinds)).map(x=>[x.kind,x.reason]),[['gn387x8','kind missing from the frozen poses']]);
 // the drift of another kind's clip is reported with its own kind
 const m2=manifest(kinds);m2.kinds.gn387x8.views.motion.plan.camera.target[2]=-90;assert.deepEqual(drifts(C.loadFrozenPoses(JSON.stringify(m2)),mapOf(kinds)).map(x=>[x.kind,x.view,x.at]),[['gn387x8','motion','/camera/target/2']]);
});

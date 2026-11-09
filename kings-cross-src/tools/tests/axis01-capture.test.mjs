import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {addGrid,gridPlan,geometryCamera,inspectGeometryFrame,joinBounds,prepareGeometryScene,prepareSideEvidence,inspectSideExtent} from '../axis01-grid.mjs';
import {captureSpecification,checkCapture,runViews,verifySources} from '../axis01-capture.mjs';
const bounds={x:[-13,10],y:[-.2,3],z:[-40,40]},width=1280,height=1000;
function fixture(){
 const scene=new T.Scene(),platforms=new T.Group(),track=new T.Group(),portals=new T.Group();platforms.name='platforms';track.name='track';portals.name='portals';scene.add(platforms,track,portals,new T.AmbientLight());
 const wall=new T.Mesh(new T.BoxGeometry(12,1,60).toNonIndexed(),new T.MeshBasicMaterial());wall.name='platform-walls';wall.position.y=.3;platforms.add(wall);
 const rail=new T.Mesh(new T.BoxGeometry(.1,.1,60),new T.MeshBasicMaterial());rail.position.set(-10,-.05,0);track.add(rail);
 const top=new T.Mesh(new T.PlaneGeometry(12,60),new T.MeshBasicMaterial());top.name='platform-tops';top.rotation.x=-Math.PI/2;top.position.y=.8;platforms.add(top);
 const rows=[{ref:'0',drawnTopSamples:[[0,.8,0],[0,.8,20]]}];return {scene,platforms,track,rows};
}
function framed(view='top'){
 const f=fixture(),plan=gridPlan(bounds,view),grid=addGrid(T,f.scene,plan),{camera}=geometryCamera(T,bounds,view,width,height,{heightAt:()=>0});
 return {...f,plan,grid,camera,inspect:()=>inspectGeometryFrame(T,f.scene,camera,grid,plan,bounds,f.rows,width,height)};
}
test('geometry grids use actual ten metre line spacing in horizontal and vertical world planes',()=>{
 for(const view of ['top','side']){
  const f=framed(view);assert.equal(f.plan.spacingM,10);assert.ok(f.plan.lines.length>10);assert.equal(f.plan.labels.length>0,true);
  const lines=f.grid.getObjectByName('grid-minor-10m'),p=lines.geometry.attributes.position;
  assert.equal(p.count,f.plan.lines.filter(l=>!l.major).length*2);assert.equal(lines.material.depthTest,false);
  assert.doesNotThrow(()=>assert.equal(f.inspect().clear,true));
  lines.geometry.scale(.5,1,.5);assert.equal(f.inspect().clear,false,'the drawn grid, not just its metadata, must measure ten metres');
 }
 assert.throws(()=>gridPlan(bounds,'top',1));assert.throws(()=>gridPlan(bounds,'oblique'));
});
test('geometry cameras preserve metre scale and north-up orientation while clearing the actual side terrain',()=>{
 const top=geometryCamera(T,bounds,'top',1280,1000,{heightAt:()=>20});assert.equal(top.camera.isOrthographicCamera,true);assert.deepEqual(top.camera.up.toArray(),[0,0,-1]);
 const side=geometryCamera(T,bounds,'side',1600,500,{heightAt:()=>40});assert.ok(side.camera.position.y>=40.5);assert.equal(side.metadata.groundY,40);
 const a=new T.Vector3(0,0,0).project(side.camera),b=new T.Vector3(0,10,0).project(side.camera),c=new T.Vector3(0,0,10).project(side.camera);
 assert.ok(Math.abs(Math.abs((a.y-b.y)*250)-Math.abs((a.x-c.x)*800))<1e-6,'ten vertical and horizontal metres project to equal pixels');
 assert.throws(()=>geometryCamera(T,bounds,'side',1600,500,{heightAt:()=>NaN}));
 assert.deepEqual(joinBounds(bounds,{x:[-20,30],y:[0,2],z:[-20,20]}).x,[-20,30]);assert.throws(()=>joinBounds({x:[0,NaN],y:[0,1],z:[0,1]}));
});
test('capture cutaways retain actual platforms track portals terrain and lights and name hidden architecture',()=>{
 const f=fixture(),shed=new T.Group(),terrain=new T.Group();shed.name='shed';terrain.name='terrain';f.scene.add(shed,terrain);
 let hidden;assert.doesNotThrow(()=>{hidden=prepareGeometryScene(f.scene);});assert.deepEqual(hidden,['shed']);assert.equal(shed.visible,false);assert.equal(terrain.visible,true);assert.equal(f.platforms.visible,true);assert.equal(f.scene.children.find(o=>o.isLight).visible,true);
 assert.deepEqual(prepareGeometryScene(f.scene,'side'),['terrain']);assert.equal(terrain.visible,false,'the side projection is explicitly a terrain section');
 f.scene.remove(f.track);assert.throws(()=>prepareGeometryScene(f.scene),/track/);
});
test('geometry captures reject covered platform tops with named occluders and reject clipped extents',()=>{
 const f=framed();assert.equal(f.inspect().clear,true);
 const roof=new T.Mesh(new T.BoxGeometry(30,.2,80),new T.MeshBasicMaterial());roof.name='synthetic-roof';roof.position.y=5;f.scene.add(roof);
 const covered=f.inspect();assert.equal(covered.clear,false);assert.match(covered.reason,/no exposed drawn top/);assert.match(covered.probes[0].results[0].blocker,/synthetic-roof/);assert.ok(covered.probes[0].results[0].hitDistanceM>0);
 roof.visible=false;f.camera.left=-1;f.camera.right=1;f.camera.updateProjectionMatrix();assert.equal(f.inspect().clear,false);
});
test('geometry capture requires all eleven measured platforms and a genuine GPU draw of grid track and slabs',()=>{
 const report={platforms:Array.from({length:11},(_,i)=>({ref:String(i),drawnTopSamples:[[0,0,0]]})),inputs:{graph:{sha256:'hash'}},captureBounds:{station:bounds,throat:bounds}};
 assert.equal(captureSpecification(report).views.length,5);const missing=structuredClone(report);missing.platforms.pop();assert.throws(()=>captureSpecification(missing));
 const noSamples=structuredClone(report);noSamples.platforms[0].drawnTopSamples=[];assert.throws(()=>captureSpecification(noSamples));
 const observed={view:'top',visibility:{clear:true},renderer:'ANGLE Metal Apple GPU',rendered:{grid:true,track:true,platforms:true}};assert.equal(checkCapture('top',observed),true);
 for(const change of [{view:'side'},{renderer:'Apple GPU OpenGL'},{renderer:'SwiftShader Metal software'},{visibility:{clear:false}},{rendered:{grid:true,track:false,platforms:true}},{rendered:{grid:false,track:true,platforms:true}},{rendered:{grid:true,track:true,platforms:false}}])assert.throws(()=>checkCapture('top',{...observed,...change}));
});
test('geometry capture keeps independent view failures and exits nonzero when a required view is missing',async()=>{
 let result;await assert.doesNotReject(async()=>{result=await runViews([{id:'top'},{id:'side'}],async v=>{if(v.id==='top')throw Object.assign(new Error('occluded'),{details:{blocker:'roof'}});return {view:v.id};});});
 assert.equal(result.shots.length,1);assert.deepEqual(result.missing,['top']);assert.equal(result.exitCode,1);assert.equal(result.failed[0].details.blocker,'roof');
 assert.equal((await runViews([{id:'top'}],async v=>({view:v.id}))).exitCode,0);
});
test('geometry capture rejects stale source fingerprints before starting Chrome',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(scratch+'/axis01-capture-test-'),bytes=Buffer.from('synthetic');await writeFile(dir+'/graph.json',bytes);
 const source={path:'graph.json',sha256:createHash('sha256').update(bytes).digest('hex')};await assert.doesNotReject(verifySources(dir,{inputs:{graph:source,sources:[]}}));
 await assert.rejects(verifySources(dir,{inputs:{graph:{...source,sha256:'0'.repeat(64)},sources:[]}}),/source changed/);await assert.rejects(verifySources(dir,{inputs:{graph:{...source,path:'../graph.json'},sources:[]}}),/invalid/);
});


test('side evidence requires actual geometry extent in both ten metre grid axes',()=>{
 const scene=new T.Scene(),train=new T.Group();train.name='train-synthetic';
 train.add(new T.Group());const car=new T.Mesh(new T.BoxGeometry(2.7,3.6,26),new T.MeshBasicMaterial());car.position.y=2;train.add(car);scene.add(train);
 const evidence=prepareSideEvidence(T,scene,'side',{},null,[{kind:'lner5',group:train}]);
 const {camera}=geometryCamera(T,evidence.bounds,evidence.projection,1280,600);
 evidence.view='synthetic-carriage';let result=inspectSideExtent(T,scene,camera,evidence,1280,600);assert.equal(result.clear,true);assert.ok(result.extentM[0]>25);assert.ok(result.extentM[1]>3.5);
 car.scale.y=.01;result=inspectSideExtent(T,scene,camera,evidence,1280,600);assert.equal(result.clear,false);assert.match(result.reason,/flat/);
 car.scale.set(.01,1,.01);assert.equal(inspectSideExtent(T,scene,camera,evidence,1280,600).clear,false);
 const observed={view:'side',visibility:{clear:true},renderer:'ANGLE Metal Apple GPU',rendered:{grid:true,track:true,platforms:true,targets:true}};
 assert.throws(()=>checkCapture('side',observed));
});

test('throat section draws sampled terrain height rather than an empty flat cutaway',()=>{
 const scene=new T.Scene(),report={tunnels:[{id:'gasworks-south',osmOrigin:[42,-460]}]};
 const evidence=prepareSideEvidence(T,scene,'terrain-section',report,{heightAt:(x,z)=>Math.max(0,(-z-400)/8)});
 assert.equal(evidence.section.points.length,153);assert.equal(evidence.section.spacingM,1);assert.ok(scene.getObjectByName('axis01-terrain-section'));
 const {camera}=geometryCamera(T,evidence.bounds,evidence.projection,1600,600);
 assert.equal(inspectSideExtent(T,scene,camera,evidence,1600,600).clear,true);
 const flatScene=new T.Scene(),flat=prepareSideEvidence(T,flatScene,'terrain-section',report,{heightAt:()=>0});
 const flatCamera=geometryCamera(T,flat.bounds,flat.projection,1600,600).camera;
 assert.equal(inspectSideExtent(T,flatScene,flatCamera,flat,1600,600).clear,false);
});

test('carriage cutaway requires exposed actual rail and platform wall hits',()=>{
 const scene=new T.Scene(),train=new T.Group(),track=new T.Group(),platforms=new T.Group();
 train.name='train-synthetic';track.name='track';platforms.name='platforms';train.add(new T.Group());
 const material=new T.MeshBasicMaterial({side:T.DoubleSide});
 const car=new T.Mesh(new T.BoxGeometry(2.7,3.6,26),material);car.position.y=2;train.add(car);
 const rail=new T.Mesh(new T.BoxGeometry(.072,.1,40),material);rail.name='track-rails';rail.position.set(.75,-.05,0);track.add(rail);
 const wall=new T.Mesh(new T.BoxGeometry(.2,.9,40),material);wall.name='platform-walls';wall.position.set(-2,.45,0);platforms.add(wall);scene.add(train,track,platforms);
 const evidence=prepareSideEvidence(T,scene,'side',{},null,[{kind:'lner5',group:train}]),{camera}=geometryCamera(T,evidence.bounds,evidence.projection,1280,600);
 camera.near=camera.position.x-(evidence.bounds.x[1]+.1);camera.updateProjectionMatrix();
 assert.equal(inspectSideExtent(T,scene,camera,evidence,1280,600).clear,true);
 rail.visible=false;const failed=inspectSideExtent(T,scene,camera,evidence,1280,600);assert.equal(failed.clear,false);assert.equal(failed.context.find(p=>p.name==='track-rails').clear,false);
});

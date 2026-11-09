import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {readPng,inspectCapturePixels} from '../axis01-pixels.mjs';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {buildTrack} from '../../web/src/track.ts';
import {TUNNEL_DEPTH} from '../../core/scene.ts';
import {addGrid,gridPlan,geometryCamera,inspectGeometryFrame,joinBounds,prepareGeometryScene,prepareSideEvidence,inspectSideExtent,layoutGridLabels,inspectGridLabels,sampleEcmlSection,pixelSpecification,renderGridBaseline} from '../axis01-grid.mjs';
import {captureSpecification,checkCapture,runViews,verifySources,ecmlSectionRoute} from '../axis01-capture.mjs';
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
  lines.geometry.scale(view==='top'?.5:1,1,view==='side'?.5:1);assert.equal(f.inspect().clear,false,'the drawn horizontal grid, not just its metadata, must measure ten metres');
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
 const observed={view:'top',visibility:{clear:true,labels:{clear:true}},renderer:'ANGLE Metal Apple GPU',rendered:{grid:true,track:true,platforms:true}};assert.equal(checkCapture('top',observed),true);
 for(const change of [{visibility:{clear:true,labels:{clear:false}}},{view:'side'},{renderer:'Apple GPU OpenGL'},{renderer:'SwiftShader Metal software'},{visibility:{clear:false}},{rendered:{grid:true,track:false,platforms:true}},{rendered:{grid:false,track:true,platforms:true}},{rendered:{grid:true,track:true,platforms:false}}])assert.throws(()=>checkCapture('top',{...observed,...change}));
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

function profileFixture(tunnel=true){
 const scene=new T.Scene(),track=new T.Group();track.name='track';scene.add(track);
 const route={segments:[{a:[0,0],b:[20,-950],tunnel:false,wayId:1},{a:[20,-950],b:[60,-1900],tunnel,wayId:2}]};
 for(const [name,a,b,y] of [['track-lines',[0,0],[20,-950],0],[tunnel?'track-tunnel':'track-lines-second',[20,-950],[60,-1900],tunnel?-4:0]]){
  const g=new T.BufferGeometry().setFromPoints([new T.Vector3(a[0],y,a[1]),new T.Vector3(b[0],y,b[1])]);const line=new T.LineSegments(g,new T.LineBasicMaterial());line.name=name;track.add(line);
 }
 if(!tunnel){const first=track.getObjectByName('track-lines'),second=track.getObjectByName('track-lines-second');first.geometry.setAttribute('position',new T.Float32BufferAttribute([...first.geometry.attributes.position.array,...second.geometry.attributes.position.array],3));}
 return {scene,report:{sectionRoute:route}};
}
test('throat section follows the whole ECML route and measures drawn ground and rail levels with explicit exaggeration',()=>{
 const {scene,report}=profileFixture(),ground={heightAt:(x,z)=>x/10-z/1000};
 const evidence=prepareSideEvidence(T,scene,'terrain-section',report,ground),section=evidence.section;
 assert.ok(section.lengthM>1900);assert.equal(section.spacingM,2);assert.equal(section.verticalScale,10);
 assert.ok(section.ground.length>950);assert.equal(section.ground[0].s,0);assert.ok(section.ground.at(-1).z<=-1900);
 assert.ok(scene.getObjectByName('axis01-terrain-section'));assert.ok(scene.getObjectByName('axis01-rail-section'));
 assert.equal(section.ground.at(-1).y,ground.heightAt(60,-1900));assert.equal(section.ground.at(-1).x,60);
 assert.equal(section.rails[0].y,0);assert.equal(section.rails.at(-1).y,-4);
 const {camera}=geometryCamera(T,evidence.bounds,evidence.projection,2000,700);
 assert.equal(inspectSideExtent(T,scene,camera,evidence,2000,700).clear,true);
 const plan=gridPlan(evidence.bounds,'side',10,{verticalScale:section.verticalScale,chainage:true});
 assert.match(plan.meaning,/exaggeration 10x/);assert.ok(plan.labels.some(l=>l.text.startsWith('s ')));
 const ys=plan.lines.filter(l=>l.axis==='y');assert.equal(ys[1].a[1]-ys[0].a[1],100,'ten actual vertical metres are explicitly exaggerated');
 const line=scene.getObjectByName('axis01-rail-section');assert.equal(line.geometry.attributes.position.getY(line.geometry.attributes.position.count-1),-40);
 const flatFixture=profileFixture(false),flat=prepareSideEvidence(T,flatFixture.scene,'terrain-section',flatFixture.report,{heightAt:()=>0});
 const flatCamera=geometryCamera(T,flat.bounds,flat.projection,2000,700).camera;
 assert.equal(inspectSideExtent(T,flatFixture.scene,flatCamera,flat,2000,700).clear,false,'an actually flat empty section still fails');
 scene.remove(scene.getObjectByName('track'));assert.throws(()=>sampleEcmlSection(T,scene,report.sectionRoute,ground),/no drawn/);
});
test('ECML section uses a continuous buffer to northern edge route and excludes neighbouring lines',()=>{
 const data={nodes:[[1,0,0],[2,20,-950],[3,60,-1900],[4,500,-3000]],buffers:[{id:1}],rails:[{id:1,nodes:[1,2],ref:'ECM1'},{id:2,nodes:[2,3],ref:'ECM1',tunnel:true},{id:3,nodes:[2,4],ref:'OTHER'}]};
 const route=ecmlSectionRoute(data);assert.equal(route.from,1);assert.equal(route.to,3);assert.deepEqual(route.segments.map(s=>s.wayId),[1,2]);assert.ok(route.lengthM>1900);assert.equal(route.segments[1].tunnel,true);
 assert.deepEqual(route.segments[0].b,route.segments[1].a);assert.throws(()=>ecmlSectionRoute({...data,buffers:[]}));
 const reversing={nodes:[[1,0,0],[2,0,-1000],[3,50,-900],[4,50,-1900]],buffers:[{id:1}],rails:[{id:1,nodes:[1,2,3,4],ref:'ECM1'}]};
 assert.throws(()=>ecmlSectionRoute(reversing),/no continuous ECML/,'a throat zigzag cannot masquerade as a northbound survey section');
});
test('grid labels stay small in frame gutters and the readable check rejects clipped or overlapping actual labels',()=>{
 for(const view of ['top','side','cross']){
  const f=framed(view),layout=layoutGridLabels(T,f.camera,f.plan,bounds,width,height);
  assert.ok(layout.labels.length>=2,view);assert.ok(layout.labels.every(l=>l.fontPx===13));
  assert.equal(inspectGridLabels(layout.labels,layout.geometry,width,height).clear,true,view);
  for(let i=0;i<layout.labels.length;i++)for(let j=0;j<i;j++){
   const a=layout.labels[i].rect,b=layout.labels[j].rect;assert.ok(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom,'tick labels may not overlap each other');
  }
  f.grid.userData.labelRects=layout.labels;assert.equal(f.inspect().labels?.clear,true);
  const huge=structuredClone(layout.labels);huge[0].fontPx=32;assert.equal(inspectGridLabels(huge,layout.geometry,width,height).clear,false);
  const clipped=structuredClone(layout.labels);clipped[0].rect.left=-1;f.grid.userData.labelRects=clipped;
  assert.equal(f.inspect().clear,false);assert.match(f.inspect().reason,/clipped/);
  const covering=structuredClone(layout.labels);covering[0].rect={left:layout.geometry.left+1,right:layout.geometry.left+30,top:layout.geometry.top+1,bottom:layout.geometry.top+21};f.grid.userData.labelRects=covering;
  assert.equal(f.inspect().clear,false);assert.match(f.inspect().reason,/overlaps/);
 }
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

// Valid synthetic PNG chunks: these fixtures contain no recording or scene data.
function pngChunk(type,data){
 const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
 for(const b of body){crc^=b;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}
 const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
function pngImage(width,height,pixels,{channels=3,raw,depth=8,interlace=0}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=depth;header[9]=channels===3?2:6;header[12]=interlace;
 const rows=[];for(let y=0;y<height;y++)rows.push(Buffer.from([0]),pixels.subarray(y*width*channels,(y+1)*width*channels));
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(raw??Buffer.concat(rows))),pngChunk('IEND',Buffer.alloc(0))]);
}
function rasterFixture(view='terrain-section'){
 const width=600,height=400,empty=Buffer.alloc(width*height*3,240),plan={view,width,height,geometry:{left:40,right:560,top:100,bottom:320},excluded:[],grid:[],profiles:[]};
 const line=(image,points,colour)=>{for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));
  for(let j=0;j<=n;j++){const x=Math.round(a[0]+(b[0]-a[0])*j/n),y=Math.round(a[1]+(b[1]-a[1])*j/n);image.set(colour,(y*width+x)*3);}
 }};
 const grid=Buffer.from(empty);for(let x=40;x<=560;x+=20)plan.grid.push({axis:'z',points:[[x,100],[x,320]]});
 for(let y=100;y<=320;y+=20)plan.grid.push({axis:'y',points:[[40,y],[560,y]]});
 for(const path of plan.grid)line(grid,path.points,[22,139,155]);
 const profiles=[{name:'ground',colour:'ground',points:[[40,170],[300,200],[560,220]]},{name:'rail',colour:'rail',points:[[40,280],[560,280]]}];
 if(view==='terrain-section')plan.profiles=profiles;
 const full=Buffer.from(grid);for(const [i,p] of profiles.entries())line(full,p.points,i?[22,71,188]:[224,91,19]);
 return {width,height,plan,empty,grid,full,line,png:image=>pngImage(width,height,image)};
}
test('capture PNG reader decodes RGB RGBA and all five PNG row filters and rejects unsupported formats',()=>{
 const expected=Buffer.from([10,20,30,40,50,60,20,40,60,80,100,120]);
 const rows=[[20,40,60,80,100,120],[20,40,60,60,60,60],[10,20,30,40,50,60],[15,30,45,50,55,60],[10,20,30,40,50,60]];
 for(let filter=0;filter<=4;filter++){
  const raw=Buffer.from([0,...expected.subarray(0,6),filter,...rows[filter]]),decoded=readPng(pngImage(2,2,expected,{raw}));
  assert.deepEqual(decoded.pixels,expected);assert.equal(decoded.width,2);assert.equal(decoded.height,2);assert.equal(decoded.channels,3);
 }
 const rgba=Buffer.from([10,20,30,255]);assert.deepEqual(readPng(pngImage(1,1,rgba,{channels:4})).pixels,rgba);
 for(const opts of [{depth:16},{interlace:1},{raw:Buffer.from([5,1,2,3])},{raw:Buffer.from([0,1])}])assert.throws(()=>readPng(pngImage(1,1,Buffer.from([1,2,3]),opts)));
 assert.throws(()=>readPng(Buffer.from('not a PNG')));assert.throws(()=>readPng(pngImage(1,1,rgba).subarray(0,40)));
});
test('all five captures reject label-only and grid-only PNGs even when scene callbacks claim they rendered',()=>{
 for(const view of ['top','side','arch','portal','terrain-section']){
  const f=rasterFixture(view),labels=Buffer.from(f.empty);f.line(labels,[[60,60],[540,60]],[22,139,155]);
  const failed=inspectCapturePixels(f.png(labels),f.png(labels),f.plan);assert.equal(failed.clear,false,view);assert.match(failed.reason,/grid/);
  const gridOnly=inspectCapturePixels(f.png(f.grid),f.png(f.grid),f.plan);assert.equal(gridOnly.clear,false,view);
  const good=inspectCapturePixels(f.png(f.full),f.png(f.grid),f.plan);assert.equal(good.clear,true,JSON.stringify(good));
  assert.ok(good.geometry.changed>=100);assert.ok(good.grid.clear);
 }
});
test('section PNG requires orange ground and blue rails across the section rather than legend swatches',()=>{
 const f=rasterFixture(),baseline=f.png(f.grid),valid=f.png(f.full);assert.equal(inspectCapturePixels(valid,baseline,f.plan).clear,true);
 for(const missing of [0,1]){
  const image=Buffer.from(f.grid),other=f.plan.profiles[1-missing];f.line(image,other.points,missing?[224,91,19]:[22,71,188]);
  // A correctly coloured legend or isolated fragment is insufficient.
  f.line(image,[[450,85],[550,85]],missing?[22,71,188]:[224,91,19]);
  const failed=inspectCapturePixels(f.png(image),baseline,f.plan);assert.equal(failed.clear,false);assert.match(failed.reason,/profiles/);
 }
 const gridColouredRail=Buffer.from(f.grid);f.line(gridColouredRail,f.plan.profiles[0].points,[224,91,19]);f.line(gridColouredRail,f.plan.profiles[1].points,[25,62,98]);
 assert.equal(inspectCapturePixels(f.png(gridColouredRail),baseline,f.plan).clear,false,'a dark-blue grid stroke is not the saturated blue rail profile');
 const short=Buffer.from(f.grid);for(const p of f.plan.profiles)f.line(short,[[40,p.points[0][1]],[90,p.points[0][1]]],p.colour==='ground'?[224,91,19]:[22,71,188]);
 assert.equal(inspectCapturePixels(f.png(short),baseline,f.plan).clear,false);
 const excluded={...f.plan,excluded:[f.plan.geometry]};assert.equal(inspectCapturePixels(valid,baseline,excluded).clear,false);
 assert.throws(()=>inspectCapturePixels(valid,baseline,{...f.plan,width:599}),/viewport/);
});
test('capture overlays stay visible beyond scene fog and the section profiles draw above the grid',()=>{
 const {scene,report}=profileFixture();scene.fog=new T.Fog(0xffffff,1100,3600);
 const e=prepareSideEvidence(T,scene,'terrain-section',report,{heightAt:(_,z)=>-z/100}),plan=gridPlan(e.bounds,'side',10,{verticalScale:10,chainage:true}),grid=addGrid(T,scene,plan);
 const camera=geometryCamera(T,e.bounds,'side',2000,700).camera;assert.ok(camera.position.x>scene.fog.far);
 const ground=scene.getObjectByName('axis01-terrain-section'),rail=scene.getObjectByName('axis01-rail-section');
 for(const line of [ground,rail,...grid.children]){assert.equal(line.material.fog,false);assert.equal(line.material.toneMapped,false);assert.equal(line.material.depthTest,false);}
 assert.equal(rail.material.transparent,true,'profiles and grid must share the transparent render queue');assert.equal(ground.material.transparent,true);assert.ok(grid.children.every(l=>l.renderOrder<rail.renderOrder));assert.ok(grid.children.every(l=>l.renderOrder<ground.renderOrder));
 scene.updateMatrixWorld(true);const pixels=pixelSpecification(T,scene,camera,plan,e.bounds,2000,700,e,[{left:1,right:2,top:3,bottom:4}]);
 assert.equal(pixels.profiles.length,2);assert.equal(pixels.profiles[0].colour,'ground');assert.equal(pixels.profiles[1].colour,'rail');assert.deepEqual(pixels.excluded,[{left:1,right:2,top:3,bottom:4}]);
 for(const p of [...pixels.grid,...pixels.profiles])assert.ok(p.points.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)));
 assert.ok(pixels.profiles[0].points[0][0]<pixels.profiles[0].points.at(-1)[0],'chainage increases left to right');
});
test('grid baseline removes measured geometry only for its render and restores it even after failure',()=>{
 const f=framed(),hidden=new T.Group();hidden.visible=false;f.scene.add(hidden);
 const render=()=>{assert.equal(f.grid.visible,true);assert.equal(f.platforms.visible,false);assert.equal(f.track.visible,false);assert.equal(hidden.visible,false);};
 assert.doesNotThrow(()=>renderGridBaseline({render},f.scene,f.camera,f.grid));assert.equal(f.platforms.visible,true);assert.equal(f.track.visible,true);assert.equal(hidden.visible,false);
 assert.throws(()=>renderGridBaseline({render:()=>{render();throw new Error('synthetic renderer failure');}},f.scene,f.camera,f.grid),/synthetic renderer/);
 assert.equal(f.platforms.visible,true);assert.equal(f.track.visible,true);assert.equal(hidden.visible,false);
});
test('a successful capture requires a passing PNG check independently of the scene check',()=>{
 const observed={view:'top',visibility:{clear:true,labels:{clear:true}},renderer:'ANGLE Metal Apple GPU',rendered:{grid:true,track:true,platforms:true}};
 assert.throws(()=>checkCapture('top',observed,{requirePixels:true}),/pixel evidence missing/);
 assert.throws(()=>checkCapture('top',{...observed,pixels:{clear:false,reason:'label only'}},{requirePixels:true}),/label only/);
 assert.equal(checkCapture('top',{...observed,pixels:{clear:true}},{requirePixels:true}),true);
});

test('uniform blue fog is not mistaken for grid strokes and a close-up can show one vertical-height datum',()=>{
 const f=rasterFixture('side'),fog=Buffer.alloc(f.empty.length);for(let i=0;i<fog.length;i+=3)fog.set([53,70,94],i);
 const failed=inspectCapturePixels(f.png(fog),f.png(f.empty),f.plan);assert.equal(failed.grid.clear,false);assert.equal(failed.clear,false);
 const oneDatum={...f.plan,grid:f.plan.grid.filter(p=>p.axis!=='y'||p.points[0][1]===100)};
 assert.equal(inspectCapturePixels(f.png(f.full),f.png(f.grid),oneDatum).clear,true,'a carriage is shorter than one ten metre height cell');
});

test('section plots surface and tunnel rails continuously at the train datum in true metres',()=>{
 const data={nodes:[[1,0,0],[2,0,-100],[3,0,-200]],rails:[{id:1,nodes:[1,2],service:'main'},{id:2,nodes:[2,3],ref:'ECM1',service:'main',tunnel:true}]};
 const scene=new T.Scene(),track=buildTrack(data,{origin:[0,0],heading:0,width:50});scene.add(track);
 const route={segments:[{a:[0,0],b:[0,-100],tunnel:false,wayId:1},{a:[0,-100],b:[0,-200],tunnel:true,wayId:2}]};
 const evidence=prepareSideEvidence(T,scene,'terrain-section',{sectionRoute:route},{heightAt:()=>0});
 assert.equal(TUNNEL_DEPTH,0);
 const rails=evidence.section.rails;assert.ok(rails.filter(p=>!p.tunnel).every(p=>p.y===0&&p.source==='track-rails top vertices'));
 assert.ok(rails.filter(p=>p.tunnel).every(p=>p.y===0&&p.source==='track-tunnel'));
 const blue=scene.getObjectByName('axis01-rail-section'),orange=scene.getObjectByName('axis01-terrain-section');
 assert.ok(blue.renderOrder>orange.renderOrder,'blue stays visible even where drawn ground and rails coincide');
 assert.equal(blue.geometry.attributes.position.getY(0),0);
 assert.equal(blue.geometry.attributes.position.getY(blue.geometry.attributes.position.count-1),0,'exaggeration cannot shift the zero rail datum');
 const plan=gridPlan({x:[-1,1],y:[-40,220],z:[-1900,0]},'side',10,{verticalScale:10,chainage:true});
 assert.deepEqual(plan.labels.filter(p=>p.text.startsWith('y ')).map(p=>p.text),['y 0 m true','y 10 m true','y 20 m true']);
 assert.equal(plan.labels.find(p=>p.text==='y 10 m true').position[1],100);
 assert.match(evidence.section.basis,/tunnel rails.*y=0 m/);
});

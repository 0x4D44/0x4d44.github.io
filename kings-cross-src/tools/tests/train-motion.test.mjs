// M01, the motion clip (rubric-FROZEN-v1, opt-in): the plan from the geometry, the page's own placement code over a synthetic straight path, the readers that look at the
// page's bogies and the near plane, the verdicts, the PNG encoder and the contact sheet, the run of one kind's clip against a stand-in page, and the argv and frozen-poses rules.
// No Chrome and no GPU: the pictures themselves are checked by hand on the real machine.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {crc32,inflateSync} from 'node:zlib';
import * as T from 'three';
import {ALL_KINDS,trainLayout} from '../../core/train.ts';
import {PLATFORM_HEIGHT} from '../../core/scene.ts';
import {buildGraph} from '../../core/graph.ts';
import {shedLayout,shedBufferStops,worldToShed} from '../../core/station.ts';
import {BOGIE_LOD_DISTANCE} from '../../web/src/train-parts.ts';
import {buildTrain} from '../../web/src/train.ts';
import {carPoses,createLiveTrains} from '../../web/src/trains-live.ts';
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
/** A call that must not throw: a mutated function that crashes fails an assertion in the test that called it, not the run of the file. */
const safely=work=>{let out;assert.doesNotThrow(()=>{out=work();});return out;};
const formations=new Map(ALL_KINDS.map(kind=>[kind,C.describeFormation(kind)]));
/** The plan of each kind, made when a test first asks for it. */
const planned=(f,options)=>safely(()=>F.planMotion(f,options));
const planCache=new Map(),plans={get:kind=>{if(!planCache.has(kind))planCache.set(kind,safely(()=>F.planMotion(formations.get(kind))));return planCache.get(kind);}};
/** A train as the page builds it; the livery paints on a canvas only where there is a document, so it is built as it is in the other tests. */
const built=kind=>{const saved=globalThis.document;delete globalThis.document;try{return buildTrain(kind);}finally{globalThis.document=saved;}};
/** The camera of a plan as the page has it. */
const cameraOf=plan=>{const c=new T.PerspectiveCamera(plan.camera.fov,plan.camera.aspect,plan.camera.near,9000);c.position.set(...plan.camera.eye);c.lookAt(...plan.camera.target);c.updateMatrixWorld(true);return c;};
/** What the renderer does to a LOD before it draws it. */
const renderLods=(group,camera)=>group.traverse(o=>{if(o.isLOD)o.update(camera);});
/** A stand-in for describeFormation: the plain description planMotion reads. */
const standIn=(length,half,bogieZs)=>({kind:'stand-in',length,half,cars:bogieZs.map((bogies,index)=>({index,bogies}))});
const session={renderer:'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)',size:[1600,1000],devicePixelRatio:1,toneMapping:0,toneMappingExposure:1,outputColorSpace:'srgb',background:'35465e',fog:null,lights:[],lampApi:false};
const host={os:{platform:'darwin'},macModel:'Mac17,6',git:{head:'abc'}},build={indexSha256:'x'};

// ---- the numbers and the plan ----------------------------------------------------------------------------------------------------------------
check('M01 is one set of numbers for every kind: 20 m/s, a second a frame, 16 frames, the page LOD distance, V10 eye height and the distance of platform 5, outside the default views',async()=>{
 assert.deepEqual([F.MOTION.id,F.MOTION.suffix,F.MOTION.stage],['M01','motion','neutral-straight']);
 assert.deepEqual([F.MOTION.speedMps,F.MOTION.stepS,F.MOTION.frames,F.MOTION.minFrames],[20,1,16,12]);
 assert.equal(F.MOTION.lodDistanceM,BOGIE_LOD_DISTANCE,'the clip is built on the distance the page switches its bogies at');assert.equal(BOGIE_LOD_DISTANCE,150);
 assert.deepEqual(F.MOTION.zRange,[-540,160]);assert.equal(F.MOTION.zRange[1]-F.MOTION.zRange[0],700);assert.equal(F.MOTION.routeStepM,50);assert.equal(F.MOTION.slackM,100);
 assert.deepEqual([F.MOTION.boundaryMarginM,F.MOTION.distanceToleranceM,F.MOTION.clearanceMarginM,F.MOTION.targetAheadM,F.MOTION.fov],[.05,1e-6,.25,100,50]);
 assert.equal(F.MOTION_STAGE,'neutral-straight (scenery hidden)');
 assert.deepEqual(F.OPT_IN_VIEW_IDS,['M01','C01']);assert.deepEqual(F.ASKABLE_VIEW_IDS,[...F.VIEW_IDS,'M01','C01']);assert.ok(!F.VIEW_IDS.includes('M01'),'the default views stay V01-V10');
 assert.deepEqual(F.MOTION.sheet,{columns:4,tileWidth:400,tileHeight:250,gap:8});
 assert.equal(F.CATALOGUE.viewport.width/F.MOTION.sheet.tileWidth,F.CATALOGUE.viewport.height/F.MOTION.sheet.tileHeight,'a tile is the frame at a whole fraction of its size');
 // the platform 5 camera of V10: its edge at the nose of a train standing at stop 3, and a camera stands .5 m inside it
 const scene=await C.loadStationScene(),pose=scene.standing(scene.stops[F.CATALOGUE.stationStopIndex]),c=Math.cos(pose.rotationY),s=Math.sin(pose.rotationY);
 const local=([x,z])=>{const dx=x-pose.nose[0],dz=z-pose.nose[1];return [dx*c-dz*s,dx*s+dz*c];};
 const outline=scene.platforms.find(p=>p.ref==='5').pts.map(local),across=[];
 for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];if(a[1]*b[1]<0)across.push(a[0]+(b[0]-a[0])*(0-a[1])/(b[1]-a[1]));}
 const edge=Math.min(...across.map(Math.abs));
 near(edge,2.8,.005,'the edge of platform 5 from the axis, at the nose of a train at stop 3');
 near(F.MOTION.lateralM,Math.round((edge+F.CATALOGUE.platformEdgeClearM)*10)/10,1e-9,'3.3 m is that edge and the .5 m a camera stands inside it, to a tenth of a metre');
});

check('the clip camera is V10 eye height 3.3 m to the sun side of the track, looking along it, and the near volume lies within a ball about the eye',()=>{
 const cam=F.motionCamera();
 assert.deepEqual(cam.eye,[-3.3,2.6,0]);near(cam.eye[1],F.CATALOGUE.platformHeightM+F.CATALOGUE.eyeAbovePlatformM,1e-12);assert.equal(F.CATALOGUE.platformHeightM,PLATFORM_HEIGHT);
 assert.deepEqual(cam.target,[-3.3,2.6,-100]);assert.deepEqual([cam.fov,cam.aspect,cam.near],[50,1.6,1]);assert.deepEqual(cam.up,[0,1,0]);assert.equal(cam.near,F.catalogueNear(cam.eye,cam.target));
 assert.equal(Math.sign(cam.eye[0]),Math.sign(F.CATALOGUE.sunPosition[0]),'on the side the page sun is on, so the near side of the train is lit');
 assert.equal(F.motionCamera({aspect:2}).aspect,2);
 // the radius is the distance from the eye to the corners of the near plane, worked out by unprojecting them
 for(const [fov,aspect,nearM] of [[50,1.6,1],[50,1.6,.03],[30,1,2],[70,2,.5]]) {
  const camera=new T.PerspectiveCamera(fov,aspect,nearM,9000);camera.updateMatrixWorld(true);
  const corners=[[1,1],[1,-1],[-1,1],[-1,-1]].map(([x,y])=>new T.Vector3(x,y,-1).unproject(camera).length());
  for(const corner of corners)near(F.nearClipRadius({near:nearM,fov,aspect}),corner,1e-9,`fov ${fov} aspect ${aspect} near ${nearM}`);
 }
 near(F.nearClipRadius({near:1,fov:50,aspect:1.6}),1.332,.001);
});

check('every kind has one clip of 16 frames at 20 m/s on the same stage with the same camera, and each bogie changes from full to bare exactly once, never within 5 cm of the boundary',()=>{
 const flipRange={lner5:[5,11],lner9:[2,14],hull5:[5,11],lumo5:[5,11],gn387x4:[6,10],gn387x8:[4,12],gn387x12:[2,14],gn717x6:[5,11],gc180x5:[5,11],tl700x8:[4,12],tl700x12:[2,14]};
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),p=plans.get(kind),L=f.length,layout=trainLayout(kind);
  assert.equal(p.status,'OK',`${kind}: ${p.reason}`);assert.equal(p.reason,null);assert.deepEqual([p.id,p.suffix,p.frame],['M01','motion','motion']);assert.equal(p.lengthM,L);
  assert.deepEqual(p.camera,F.motionCamera(),'one camera for every kind');
  assert.deepEqual(p.clip,{stage:'neutral-straight',scenery:'hidden',zRange:[-540,160],trackLengthM:700,direction:'toward -z, nose first',speedMps:20,stepS:1,frames:16,travelM:300,lodDistanceM:150,start:'the middle of the train level with the camera',camera:'fixed for the whole clip'});
  assert.equal(p.frames.length,16);assert.ok(p.frames.length>=12);assert.equal(p.frames[0].middleZ,0,'the middle of the train is level with the camera in the first frame');
  p.frames.forEach((fr,i)=>{
   assert.equal(fr.index,i);assert.equal(fr.number,i+1);near(fr.timeS,i,1e-9);near(fr.travelM,20*i,1e-9);near(fr.noseZ,-L/2-20*i,1e-6);near(fr.middleZ,-20*i,1e-9);near(fr.tailZ,L/2-20*i,1e-6);
   near(fr.cabDistanceM,Math.hypot(3.3,2.6-1.7,0-(fr.noseZ+1.5)),1e-9,'the leading cab is 1.7 m up and 1.5 m behind the nose');
  });
  // every bogie's distance and level, worked out here from the layout and the camera
  assert.equal(p.bogies.length,2*layout.cars.length);
  for(const car of layout.cars)car.bogies.forEach((z,k)=>{
   const t=p.bogies.find(b=>b.name===`bogie-${car.index}-${k}`);assert.ok(t,`${kind} bogie-${car.index}-${k}`);assert.deepEqual([t.car,t.k,t.z],[car.index,k,z]);
   p.frames.forEach((fr,i)=>{const d=Math.hypot(3.3,2.6,-L/2-20*i+z);near(t.distanceM[i],d,1e-6,`${kind} ${t.name} frame ${i}`);assert.equal(t.level[i],d>=150?1:0);});
  });
  assert.ok(p.bogies.every(t=>t.level[0]===0&&t.level.at(-1)===1),'every bogie is full at the start and bare at the end');
  assert.equal(p.flips.length,p.bogies.length);
  for(const x of p.flips) {
   assert.deepEqual([x.nearToFar,x.farToNear],[1,0],`${kind} ${x.name}`);assert.ok(x.firstFarIndex>=1&&x.firstFarIndex<=14);assert.equal(x.lastNearIndex,x.firstFarIndex-1);
   assert.ok(x.nearDistanceM<150&&x.farDistanceM>=150,`${kind} ${x.name} crosses 150 m between the two frames`);
  }
  const firsts=p.flips.map(x=>x.firstFarIndex);assert.deepEqual([Math.min(...firsts),Math.max(...firsts)],flipRange[kind],`${kind} first and last flip frame`);
  assert.ok(p.checks.minBoundaryMarginM>=.05&&p.checks.stageSlackM>=100&&p.checks.startTailZ<=160);near(p.checks.finalNoseZ,-L/2-300,1e-6);near(p.checks.startTailZ,L/2,1e-6);near(p.checks.stageSlackM,-L/2-300+540,1e-6);
  assert.equal(p.clearance.ok,true);near(p.clearance.lateralGapM,3.3-f.half,1e-6);near(p.clearance.clipRadiusM,1.332,.001);assert.equal(p.clearance.marginM,.25);
 }
 near(Math.min(...ALL_KINDS.map(k=>plans.get(k).checks.minBoundaryMarginM)),.291,.001,'the closest any bogie of any kind comes to the boundary is on lner9');
 near(Math.min(...ALL_KINDS.map(k=>plans.get(k).checks.stageSlackM)),117.65,.01,'the longest kind, gn387x12, leaves 117.65 m of stage past its nose in the last frame');
});

check('the notes say plainly what the stage, the track, the speed, the step and the frames are, and why no clip is in the station scene',()=>{
 const p=plans.get('lner5');
 assert.equal(p.notes.stage,'neutral-straight (scenery hidden)');assert.deepEqual([p.notes.trackLengthM,p.notes.speedMps,p.notes.stepS,p.notes.frames,p.notes.travelM,p.notes.lodDistanceM],[700,20,1,16,300,150]);
 assert.match(p.notes.camera,/^fixed for the whole clip: 3\.3 m to the -x \(sun\) side of the track axis, 2\.6 m above the rail head \(V10's eye height\), level with the middle of the train at the start, looking along the track$/);
 assert.equal(p.notes.rule,F.MOTION_RULE);assert.equal(p.notes.stationScene,F.MOTION_STATION_NOTE);
 for(const text of ['M01 (opt-in, day only)','one neutral straight stage with the page scenery hidden','from z = 160 to z = -540',"the page's own carPoses (web/src/trains-live.ts)",'constant speed','the middle of the train is level with the camera',
   'the camera is fixed for the whole clip'.replace('the','The'),'V10\'s eye height','FOV 50, 1600x1000, 3.3 m from the track axis on the -x side','platform 5','but the stage has no platform','which level of detail it is drawn at and how far it is from the camera',
   'a bogie is drawn bare at 150 m or more','exactly once inside the clip','the near plane must clear the bounding box of every vertex of the train in every frame','Any difference is a GAP with its reason, never a quiet pass'])
  assert.ok(F.MOTION_RULE.includes(text),`the rule says: ${text}`);
 assert.match(F.MOTION_STATION_NOTE,/^No clip is in the station scene: the station scene could not hold the longest kinds\./);
 for(const text of ['422-436 m of open track before the first tunnel edge','lner9, gn387x12 and tl700x12 need 496-514 m','V10 remains the in-station evidence']) assert.ok(F.MOTION_STATION_NOTE.includes(text),text);
});

check('the station note is true of the data: 422-436 m of open track before the first tunnel edge north of every buffer stop, and 496-514 m needed by the three longest kinds',async()=>{
 const data=JSON.parse(await readFile(new URL('../../web/src/data/kx-track.json',import.meta.url),'utf8')),layout=shedLayout(data),graph=buildGraph(data);
 const stops=shedBufferStops(data,layout).sort((p,q)=>worldToShed(layout,[p.x,p.z]).u-worldToShed(layout,[q.x,q.z]).u),north=[Math.sin(layout.heading),-Math.cos(layout.heading)];
 // from each stop, by the straightest edge at every node, how far to the first tunnel edge
 const open=stops.map(stop=>{
  let node=stop.id,prev=-1,total=0,heading=null;
  for(let step=0;step<80;step++) {
   const edges=(graph.adj.get(node)??[]).filter(e=>(e.a===node?e.b:e.a)!==prev);if(!edges.length)return null;
   const here=graph.pos.get(node),ahead=heading??north;let pick=null;
   for(const e of edges){const n=e.a===node?e.b:e.a,p=graph.pos.get(n),len=Math.hypot(p[0]-here[0],p[1]-here[1]),d=[(p[0]-here[0])/len,(p[1]-here[1])/len],c=d[0]*ahead[0]+d[1]*ahead[1];if(!pick||c>pick.c)pick={e,n,len,d,c};}
   if(pick.e.tunnel)return total;
   total+=pick.len;heading=pick.d;prev=node;node=pick.n;
  }
  return null;
 });
 assert.equal(stops.length,9);assert.ok(open.every(m=>m!==null),'every stop reaches a tunnel edge');
 assert.equal(Math.floor(Math.min(...open)),422);assert.equal(Math.ceil(Math.max(...open)),436);
 // the track a clip needs: the tail at the start to the nose when the last bogie passes 150 m from the camera
 const along=Math.sqrt(150**2-3.3**2-2.6**2),need=kind=>{const l=trainLayout(kind);return l.length/2+along+Math.max(...l.cars.flatMap(c=>c.bogies));};
 const long=['lner9','gn387x12','tl700x12'];
 assert.equal(Math.floor(Math.min(...long.map(need))),496);assert.equal(Math.ceil(Math.max(...long.map(need))),514);
 for(const kind of ALL_KINDS)assert.equal(need(kind)>Math.max(...open),long.includes(kind),`${kind} needs ${need(kind).toFixed(1)} m: more than the longest open run only if it is one of the three`);
 // and the note the clip carries says exactly that, with these numbers and these kinds
 const note=F.MOTION_STATION_NOTE,range=values=>`${Math.floor(Math.min(...values))}-${Math.ceil(Math.max(...values))} m`;
 assert.match(note,/^No clip is in the station scene: the station scene could not hold the longest kinds\. /);
 assert.ok(note.includes(`there are ${range(open)} of open track before the first tunnel edge`),`the open run, ${range(open)}`);
 assert.ok(note.includes(`${long.slice(0,-1).join(', ')} and ${long.at(-1)} need ${range(long.map(need))} (from the tail at the start of the clip to the nose when their last bogie passes 150 m from the camera)`),`the three longest kinds and what they need, ${range(long.map(need))}`);
 assert.match(note,/ V10 remains the in-station evidence\.$/);
});

check('a clip that cannot hold a kind is a GAP that gives every reason: too few frames, a bogie bare at the start or not bare at the end, a stage too short, a train too wide for the near volume',()=>{
 const base=formations.get('gn387x4'),gap=(f,options,pattern)=>{const p=planned(f,options);assert.equal(p.status,'GAP');assert.match(p.reason,pattern);return p;};
 assert.equal(planned(base,{frames:12}).status,'OK','twelve frames are enough');
 gap(base,{frames:11},/the clip has 11 frames, fewer than 12/);
 gap(base,{speedMps:5},/bogie-0-0 is still drawn in full in the last frame \(112\.7 m\)/);
 gap(standIn(120,1.4,[[3,110]]),{speedMps:5},/bogie-0-0 changes level 0 times to bare and 0 times to full, not once to bare/);
 gap(base,{speedMps:100},/the stage ends at z = -540, under 100 m past the nose of the last frame \(z = -1540\.78\)/);
 gap(base,{stepS:2},/./);assert.equal(planned(base,{stepS:2}).clip.stepS,2);near(planned(base,{stepS:2}).frames[3].timeS,6,1e-12);near(planned(base,{stepS:2}).frames[3].travelM,120,1e-12);
 gap(standIn(400,1.4,[[3,397]]),{},/bogie-0-0 is already drawn bare in the first frame \(197\.0 m\); bogie-0-1 is already drawn bare in the first frame \(197\.0 m\)/);
 const wide=gap({...base,half:2},{},/the camera is 1\.30 m from the side of the train, under the 1\.58 m its near volume and margin need/);assert.equal(wide.clearance.ok,false);
 const tail=gap(standIn(330,1.4,[[100,230]]),{},/the tail of the first frame \(z = 165\) is behind the start of the stage \(z = 160\)/);assert.doesNotMatch(tail.reason,/bare|full/,'only the stage is wrong: the bogies of this long train flip once each');assert.match(tail.reason,/the stage ends at z = -540, under 100 m past the nose of the last frame \(z = -465\)/);
 // a bogie 2 cm either side of the boundary in one frame: place it so that frame 10 has it at 150.02 m, then at 149.98 m
 for(const [d,shown] of [[150.02,'0.020'],[149.98,'0.020']]) {
  const along=Math.sqrt(d**2-3.3**2-2.6**2),z=-along+120/2+20*10;
  gap(standIn(120,1.4,[[3,z]]),{},new RegExp(`a bogie is ${shown} m from the 150 m boundary in some frame, under the 0\\.05 m margin`));
 }
 const many=gap(formations.get('gn387x12'),{speedMps:5},/; and 32 more$/);assert.equal(many.reason.split('; ').length,7,'six reasons, then the count of the rest');assert.equal(gap(formations.get('gn387x12'),{speedMps:5},/./).reason.split('; ').filter(s=>/still drawn in full|changes level/.test(s)).length,6,'only the first six are given');
 // a bogie that starts bare, comes inside the boundary, passes the camera and leaves it again changes level twice: once to full and once to bare, and both are said
 const there=gap(standIn(330,1.4,[[100,320]]),{speedMps:25},/bogie-0-1 changes level 1 times to bare and 1 times to full, not once to bare/);assert.match(there.reason,/bogie-0-1 is already drawn bare in the first frame \(155\.\d m\)/);
 assert.deepEqual([there.flips[1].nearToFar,there.flips[1].farToNear,there.flips[1].firstFarIndex,there.flips[1].lastNearIndex],[1,1,13,12],'the change to bare is the one at the end');assert.deepEqual([there.flips[0].nearToFar,there.flips[0].farToNear],[1,0],'and the other bogie of the car changes once');
 const eight=gap(standIn(120,1.4,[[3,110],[5,112]]),{speedMps:5},/; and 2 more$/);assert.equal(eight.reason.split('; ').length,7,'four bogies, two reasons each: six and two more');
 const six=gap(standIn(120,1.4,[[3,110,100]]),{speedMps:5},/./);assert.equal(six.reason.split('; ').length,6);assert.doesNotMatch(six.reason,/ more/,'exactly six reasons are all given, with no count of the rest');
 assert.equal(planned(standIn(120,1.4,[[3,110.08]]),{}).status,'GAP','one bogie near the boundary ruins the clip for its kind');
});

// ---- the page's own placement code over a synthetic path ---------------------------------------------------------------------------------------
check('a route is straight edges between points and a train view on it is the motion model\'s own: occupied intervals tail to nose, heading clockwise from north',()=>{
 const route=C.polylineRoute([[0,160],[0,110],[0,60]]);
 assert.deepEqual(route.cum,[0,50,100]);assert.equal(route.lengthM,100);assert.deepEqual([...route.graph.pos],[[0,[0,160]],[1,[0,110]],[2,[0,60]]]);
 assert.deepEqual(route.graph.edges.map(e=>[e.wayId,e.a,e.b,e.length,e.service,e.tunnel]),[[1,0,1,50,'main',false],[1,1,2,50,'main',false]]);assert.deepEqual([...route.graph.adj].map(([n,e])=>[n,e.length]),[[0,1],[1,2],[2,1]]);
 const v=C.trainViewAt(route,70,30,{id:7,speed:20});
 assert.deepEqual(v.occupied.map(s=>[s.edge.a,s.edge.b,s.fromT,s.toT]),[[0,1,.8,1],[1,2,0,.4]],'30 m long with the nose 70 m along: the last 10 m of the first edge and the first 20 m of the second');
 assert.deepEqual([v.id,v.speed,v.lengthM,v.state,v.opacity,v.description,v.blocked,v.reversals,v.distanceM],[7,20,30,'moving',1,'capture',false,0,70]);near(v.occupiedLengthM,30,1e-12);
 assert.equal(v.leading.edge,route.graph.edges[1]);near(v.leading.t,.4,1e-12);vec(v.leading.point,[0,90],1e-12);near(v.heading,0,1e-12,'toward -z is north');
 const onNode=C.trainViewAt(route,50,30);assert.deepEqual(onNode.occupied.map(s=>[s.edge.a,s.fromT,s.toT]),[[0,.4,1]],'a nose exactly on a node leaves no empty interval on the next edge');assert.equal(onNode.leading.edge,route.graph.edges[0]);near(onNode.leading.t,1,1e-12);
 near(C.trainViewAt(C.polylineRoute([[0,0],[50,0]]),30,10).heading,Math.PI/2,1e-12,'east is a quarter turn clockwise');near(C.trainViewAt(C.polylineRoute([[0,0],[0,50]]),30,10).heading,Math.PI,1e-12,'south is a half turn');
 assert.throws(()=>C.trainViewAt(route,120,30),/does not fit a route 100 m long/);assert.throws(()=>C.trainViewAt(route,20,30),/does not fit/);assert.throws(()=>C.trainViewAt(route,50,0),/occupies none of the route/);
 assert.throws(()=>C.polylineRoute([[0,0]]),/at least two points/);assert.throws(()=>C.polylineRoute([[0,0],[0,0]]),/route point 1 repeats point 0/);assert.throws(()=>C.polylineRoute('ab'),/at least two points/);
});

check('the page\'s own placement code (carPoses) puts every bogie of every kind where the plan has it, the cars unturned, and the capture refuses what it cannot vouch for',()=>{
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),plan=plans.get(kind),p=C.motionPoses(f,plan);
  assert.equal(p.ok,true,`${kind}: ${p.problems}`);assert.ok(p.maxErrorM<1e-9,`${kind} ${p.maxErrorM}`);assert.equal(p.frames.length,16);assert.deepEqual(p.route,{points:15,edges:14,lengthM:700});
  p.frames.forEach((fr,i)=>{
   assert.equal(fr.index,i);near(fr.noseS,160+f.length/2+20*i,1e-6);assert.equal(fr.cars.length,f.cars.length);
   for(const c of fr.cars){near(c.position[0],0,1e-9);near(c.position[1],plan.frames[i].noseZ,1e-9);near(c.rotationY,0,1e-12);near(c.scaleZ,1,1e-12);assert.deepEqual(c.bogies.map(b=>b.k),[0,1]);for(const b of c.bogies)near(b.rotationY,0,1e-12);}
  });
 }
 const small=structuredClone(plans.get('gn387x4'));small.bogies[3].z+=.01;assert.equal(C.motionPoses(formations.get('gn387x4'),small).ok,false,'a centimetre is a disagreement');
 const tampered=structuredClone(plans.get('gn387x4')),a=C.motionPoses(formations.get('gn387x4'),(tampered.bogies[3].z+=1,tampered));
 assert.equal(a.ok,false);assert.match(a.problems[0],/^frame 1: carPoses puts bogie-1-1 at z -?[\d.]+ \(x 0\), the geometry says z -?[\d.]+$/);assert.ok(a.maxErrorM>=.99&&a.maxErrorM<=1.01);
 const lost=structuredClone(plans.get('gn387x4'));lost.bogies.pop();
 const b=C.motionPoses(formations.get('gn387x4'),lost);assert.equal(b.ok,false);assert.match(b.problems[0],/^frame 1: carPoses poses 4 of 4 cars and the plan has 7 bogies$/);assert.ok(b.problems.some(m=>/the plan has no bogie-3-1/.test(m)));
 const short=structuredClone(plans.get('gn387x4'));short.frames[1].noseZ=-5;
 assert.equal(C.motionPoses(formations.get('gn387x4'),short).ok,true,'the poses follow whatever nose the plan gives, so the tamper is in the bogie, not the frame');
});

check('placement code that is wrong is caught: a car turned, stretched, off the axis or moved along, a bogie across the track or off its place, a car missing, a bogie too many',()=>{
 const kind='gn387x4',f=formations.get(kind),plan=plans.get(kind),via=change=>(graph,view,layout)=>change(carPoses(graph,view,layout));
 const check=(change,pattern,p=plan)=>{const out=C.motionPoses(f,p,via(change));assert.equal(out.ok,false,String(pattern));assert.ok(out.problems.some(m=>pattern.test(m)),`${pattern} in ${out.problems.slice(0,3)}`);return out;};
 const only=(change,pattern)=>{const out=check(change,pattern);assert.equal(out.problems.filter(m=>!pattern.test(m)).length,0,out.problems.find(m=>!pattern.test(m)));return out;};
 assert.equal(C.motionPoses(f,plan,via(poses=>poses)).ok,true);assert.equal(C.motionPoses(f,plan).ok,true,'the page\'s own carPoses is the default');
 // a car: turned, stretched, off the axis, moved along the track
 const carMessage=/^frame \d+: carPoses puts car-\d at -?[\d.e-]+,-?[\d.]+ turned -?[\d.e-]+ and stretched [\d.e-]+, the geometry says \(0, -?[\d.]+\), square and unstretched$/;
 check(poses=>poses.map(p=>({...p,rotationY:.01})),/^frame 1: carPoses puts car-0 at 0,-[\d.]+ turned 0\.01 and stretched [\d.]+, the geometry says \(0, -[\d.]+\), square and unstretched$/);
 only(poses=>poses.map(p=>({...p,scaleZ:1.001})),/^frame \d+: carPoses puts car-\d at 0,-[\d.]+ turned 0 and stretched 1\.001, the geometry says \(0, -[\d.]+\), square and unstretched$/);
 only(poses=>poses.map(p=>({...p,position:[.001,p.position[1]]})),carMessage);only(poses=>poses.map(p=>({...p,position:[p.position[0],p.position[1]+.001]})),carMessage);
 // their tolerances: a micrometre is the same place, 2 micrometres are not
 const ok=poses=>assert.equal(C.motionPoses(f,plan,via(poses)).ok,true);
 ok(poses=>poses.map(p=>({...p,position:[5e-7,p.position[1]-5e-7],rotationY:5e-10,scaleZ:1+5e-10})));
 only(poses=>poses.map(p=>({...p,position:[2e-6,p.position[1]]})),carMessage);only(poses=>poses.map(p=>({...p,position:[0,p.position[1]-2e-6]})),carMessage);only(poses=>poses.map(p=>({...p,scaleZ:1+2e-9})),carMessage);
 check(poses=>poses.map(p=>({...p,rotationY:2e-9})),/carPoses puts car-0 at .* turned 2e-9 and stretched [\d.]+,/);
 // a bogie: across the track (its direction), off its place, to a micrometre
 const bogieTurn=/^frame \d+: carPoses turns bogie-0-0 by [\d.e-]+ rad on a straight path$/;
 only(poses=>poses.map(p=>p.car.index===0?{...p,frontBogie:{...p.frontBogie,back:[.01,1]}}:p),bogieTurn);
 ok(poses=>poses.map(p=>({...p,frontBogie:{...p.frontBogie,back:[1e-10,1]}})));check(poses=>poses.map(p=>({...p,frontBogie:{...p.frontBogie,back:[1e-8,1]}})),bogieTurn);
 only(poses=>poses.map(p=>p.car.index===0?{...p,rearBogie:{...p.rearBogie,point:[p.rearBogie.point[0],p.rearBogie.point[1]+.5]}}:p),/^frame \d+: carPoses puts bogie-0-1 at z -?[\d.]+ \(x 0\), the geometry says z -?[\d.]+$/);
 only(poses=>poses.map(p=>p.car.index===0?{...p,frontBogie:{...p.frontBogie,point:[.5,p.frontBogie.point[1]]}}:p),/^frame \d+: carPoses puts bogie-0-0 at z -?[\d.]+ \(x 0\.5\), the geometry says z -?[\d.]+$/);
 ok(poses=>poses.map(p=>({...p,frontBogie:{...p.frontBogie,point:[5e-7,p.frontBogie.point[1]]}})));
 // along the track too, to a micrometre, and a place that is not a number is not a place
 const alongMessage=/^frame \d+: carPoses puts bogie-0-1 at z -?[\d.]+ \(x 0\), the geometry says z -?[\d.]+$/,along=d=>poses=>poses.map(p=>p.car.index===0?{...p,rearBogie:{...p.rearBogie,point:[p.rearBogie.point[0],p.rearBogie.point[1]+d]}}:p);
 ok(along(5e-7));only(along(2e-6),alongMessage);only(along(-2e-6),alongMessage);
 only(poses=>poses.map(p=>p.car.index===0?{...p,frontBogie:{...p.frontBogie,point:[0,NaN]}}:p),/^frame \d+: carPoses puts bogie-0-0 at z NaN \(x 0\), the geometry says z -?[\d.]+$/);
 // too few cars posed, and a plan with a bogie the layout has not
 check(poses=>poses.slice(0,3),/^frame 1: carPoses poses 3 of 4 cars and the plan has 8 bogies$/);
 const trimmed=structuredClone(plan);trimmed.bogies=trimmed.bogies.filter(b=>b.car<3);check(poses=>poses.slice(0,3),/^frame 1: carPoses poses 3 of 4 cars and the plan has 6 bogies$/,trimmed);
 const extra=structuredClone(plan);extra.bogies.push({...extra.bogies[0],name:'bogie-9-9',car:9,k:0});check(poses=>poses,/^frame 1: carPoses poses 4 of 4 cars and the plan has 9 bogies$/,extra);
 const stray=structuredClone(plan);stray.bogies[2].car=7;check(poses=>poses,/^frame 1: the plan has no bogie-1-0$/,stray);
 // every frame is checked, and the largest error is the one reported
 const second=C.motionPoses(f,plan,via(poses=>poses.map(p=>({...p,frontBogie:{...p.frontBogie,point:[0,p.frontBogie.point[1]+.25]}}))));assert.equal(second.problems.filter(m=>/^frame \d+: carPoses puts bogie-\d-0 /.test(m)).length,16*4);near(second.maxErrorM,.25,1e-9);
});

check('posing cars from carPoses payloads is exactly what createLiveTrains.update does, bogie turns included, on a path that bends',()=>{
 const kind='gn387x4',L=formations.get(kind).length,layout=trainLayout(kind);
 // a path of straight edges that bends three times inside the train, so the cars turn and stretch and the bogies turn against them
 const route=C.polylineRoute([[0,0],[0,-60],[25,-110],[85,-130],[150,-160],[230,-160]]);
 const view=C.trainViewAt(route,L+12,L,{id:3,speed:15}),saved=globalThis.document;delete globalThis.document;
 let live,driven,parent;
 try{parent=new T.Group();live=createLiveTrains(route.graph,parent,()=>kind);live.update([{...view,formationNote:undefined}]);driven=parent.children[0];}finally{globalThis.document=saved;}
 const payload=C.pagePoses(carPoses(route.graph,view,layout)),mine=built(kind);F.applyCarPoses(mine,payload);
 for(const car of layout.cars){const node=mine.getObjectByName(`car-${car.index}`);vec([node.matrixWorld.elements[12],node.matrixWorld.elements[14]],[node.position.x,node.position.z],1e-12,`the world matrix of car-${car.index} is current once the cars are posed`);}
 assert.ok(mine.getObjectByName('car-1').matrixWorld.elements[14]!==0,'and the car really is away from the origin');
 assert.equal(payload.length,4);assert.ok(payload.some(c=>Math.abs(c.rotationY)>.1),'the path really turns the cars');assert.ok(payload.some(c=>c.bogies.some(b=>Math.abs(b.rotationY)>.01)),'and the bogies against them');assert.ok(payload.some(c=>Math.abs(c.scaleZ-1)>1e-4),'and stretches a chord');
 for(const car of layout.cars) {
  const a=driven.getObjectByName(`car-${car.index}`),b=mine.getObjectByName(`car-${car.index}`);
  assert.equal(b.visible,a.visible);vec(b.position.toArray(),a.position.toArray(),1e-12,`car-${car.index} position`);near(b.rotation.y,a.rotation.y,1e-12,`car-${car.index} rotation`);near(b.scale.z,a.scale.z,1e-12);near(b.scale.x,1,0);near(b.scale.y,1,0);
  for(const k of [0,1]){const x=a.getObjectByName(`bogie-${car.index}-${k}`),y=b.getObjectByName(`bogie-${car.index}-${k}`);near(y.rotation.y,x.rotation.y,1e-12,`bogie-${car.index}-${k}`);}
 }
 // a car the path cannot hold is hidden by both, and the payload has no entry for it
 const early=C.trainViewAt(route,L-20,L-20,{id:4}),shortPayload=C.pagePoses(carPoses(route.graph,early,layout));
 const fresh=built(kind);F.applyCarPoses(fresh,shortPayload);assert.equal(shortPayload.length,3);assert.deepEqual(fresh.children.map(o=>o.visible),[true,true,true,false]);
 assert.throws(()=>F.applyCarPoses(built(kind),[{index:9,position:[0,0],rotationY:0,scaleZ:1,bogies:[]}]),/the specimen has no car-9/);
 assert.throws(()=>F.applyCarPoses(built(kind),[{index:0,position:[0,0],rotationY:0,scaleZ:1,bogies:[{k:5,rotationY:0}]}]),/car-0 has no bogie-0-5/);
});

// ---- the stage ---------------------------------------------------------------------------------------------------------------------------------
check('the stage can be given an explicit run, and then its rails, ballast and sleepers cover exactly that run; the default stage is unchanged',()=>{
 const stage=F.buildCatalogueStage(T,{zRange:[-540,160]}),byName=n=>stage.getObjectByName(n),box=o=>new T.Box3().setFromObject(o);
 for(const n of ['capture-stage-rail-left','capture-stage-rail-right','capture-stage-ballast']){near(box(byName(n)).min.z,-540,1e-4,n);near(box(byName(n)).max.z,160,1e-4,n);}
 const sleepers=byName('capture-stage-sleepers'),first=new T.Matrix4(),last=new T.Matrix4();sleepers.getMatrixAt(0,first);sleepers.getMatrixAt(sleepers.count-1,last);
 assert.equal(sleepers.count,Math.floor(700/.65));near(new T.Vector3().setFromMatrixPosition(first).z,-540+.325,1e-4);near(new T.Vector3().setFromMatrixPosition(last).z,-540+.325+(sleepers.count-1)*.65,1e-3);
 near(byName('capture-stage-ground').position.z,-190,1e-9,'the ground is centred on the run, not on the origin');
 assert.deepEqual(stage.userData.levels.zRange,[-540,160]);assert.equal(stage.userData.levels.sleepers,sleepers.count);assert.equal(stage.userData.levels.railHeadTopY,0);
 assert.deepEqual(F.buildCatalogueStage(T,{length:100}).userData.levels.zRange,[-60,160]);assert.deepEqual(F.buildCatalogueStage(T,{length:100,margin:5}).userData.levels.zRange,[-5,105]);
 assert.deepEqual(F.buildCatalogueStage(T,{length:100,margin:5,zRange:[-10,20]}).userData.levels.zRange,[-10,20],'an explicit run replaces the length and margin');
 assert.deepEqual(F.buildCatalogueStage(T,{length:100,zRange:undefined}).userData.levels.zRange,[-60,160]);
});

// ---- the readers in the page ----------------------------------------------------------------------------------------------------------------
check('the vertex boxes are the exact world-space boxes of the visible meshes\' vertices, named by their path; a mesh whose vertices are not its geometry\'s is refused',()=>{
 const root=new T.Group(),car=new T.Group(),material=new T.MeshBasicMaterial();car.name='car-0';car.position.set(1,0,3);root.add(car);
 const plank=new T.Mesh(new T.BoxGeometry(2,1,10),material);plank.name='body-shell';plank.position.set(5,1,-20);plank.rotation.y=Math.PI/2;car.add(plank);
 const hidden=new T.Mesh(new T.BoxGeometry(1,1,1),material);hidden.name='hidden';hidden.visible=false;car.add(hidden);
 const bare=new T.Mesh(new T.BoxGeometry(1,1,1),material);car.add(bare);
 const shard=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,0,4,0,0,0,0,4],3)),turned=new T.Mesh(shard,material);turned.name='shard';turned.rotation.y=Math.PI/4;root.add(turned);
 const boxes=F.vertexBoxes(T,root);
 assert.deepEqual(boxes.map(b=>b.name),['car-0/body-shell','car-0/Mesh','shard'],'visible meshes only, an unnamed one by its type');assert.deepEqual(boxes.map(b=>b.vertices),[24,24,3]);
 vec(boxes[0].min,[1,.5,-18],1e-9);vec(boxes[0].max,[11,1.5,-16],1e-9,'10 m long and 2 m wide, turned a quarter: 10 m in x and 2 m in z, centred (6, 1, -17)');
 // the three vertices of the shard, turned an eighth about y: its box is the box of those points, not of the corners of its local box
 const c=Math.SQRT1_2;vec(boxes[2].min,[0,0,-4*c],1e-6);vec(boxes[2].max,[4*c,0,4*c],1e-6);
 assert.throws(()=>F.vertexBoxes(T,Object.assign(new T.Group(),{children:[]}).add(new T.InstancedMesh(shard,material,2))),/is instanced: its vertices are not its geometry's/);
 const skinned=new T.SkinnedMesh(shard,material);skinned.name='skin';assert.throws(()=>F.vertexBoxes(T,new T.Group().add(skinned)),/skin is skinned/);
 // a box with no vertices is skipped, an empty tree has no boxes
 assert.deepEqual(F.vertexBoxes(T,new T.Group().add(new T.Mesh(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([],3)),material))),[]);assert.deepEqual(F.vertexBoxes(T,new T.Group()),[]);
 assert.deepEqual(F.vertexBoxes(T,new T.Group().add(new T.Mesh(new T.BufferGeometry(),material))),[],'a mesh with no position attribute at all has no box either');
});

check('the distance to a box is zero inside it, and the near plane clears a box only when it is farther than the near volume\'s ball plus the margin',()=>{
 const box={min:[0,0,0],max:[2,2,2]};
 assert.equal(F.boxDistance(box,[1,1,1]),0);assert.equal(F.boxDistance(box,[0,0,0]),0,'on a corner');assert.equal(F.boxDistance(box,[5,1,1]),3);assert.equal(F.boxDistance(box,[1,-4,1]),4);assert.equal(F.boxDistance(box,[1,1,-7]),7);
 near(F.boxDistance(box,[5,6,2]),5,1e-12,'a corner is the diagonal');near(F.boxDistance(box,[-3,-4,1]),5,1e-12);near(F.boxDistance(box,[-1,3,4]),Math.hypot(1,1,2),1e-12);
 const view={near:1,fov:50,aspect:1.6};
 const at=(x,margin)=>F.checkNearClearance([{name:'far',min:[x,0,0],max:[x+1,1,1]},{name:'high',min:[0,40,0],max:[1,41,1]}],[0,0.5,0.5],{...view,marginM:margin});
 // eye at (0, .5, .5): the box at x = 1.6 is 1.6 m away; the ball is 1.332 m
 assert.equal(at(1.6,0).ok,true);assert.equal(at(1.6,0.25).ok,true,'1.6 > 1.332 + .25');assert.equal(at(1.5,0.25).ok,false,'1.5 < 1.582');assert.equal(at(1.3,0).ok,false,'inside the ball');assert.equal(at(1.4,0).ok,true);assert.equal(at(1.4,.25).ok,false);
 const r=at(1.5,.25);near(r.clipRadiusM,F.nearClipRadius(view),1e-12);assert.deepEqual([r.nearM,r.marginM,r.boxes],[1,.25,2]);near(r.minDistanceM,1.5,1e-12);assert.equal(r.nearest.name,'far');assert.deepEqual(r.violations.map(v=>v.name),['far']);
 assert.match(r.reason,/^the near plane \(near 1 m, clip radius 1\.332 m, margin 0\.25 m\) is cut by 1 bounding box\(es\), the nearest far at 1\.500 m$/);assert.equal(at(1.6,0).reason,null);assert.equal(r.check,'near-plane clearance of the bounding box of every vertex');
 // an eye inside a box is inside the train; the worst offender is named first, and no more than eight are listed
 const inside=F.checkNearClearance([{name:'room',min:[-1,-1,-1],max:[1,1,1]},{name:'plank',min:[1.2,0,0],max:[2,1,1]}],[0,0,0],{...view,marginM:0});
 assert.equal(inside.ok,false);assert.equal(inside.nearest.name,'room');assert.equal(inside.minDistanceM,0);assert.deepEqual(inside.violations.map(v=>v.name),['room','plank']);
 const crowd=F.checkNearClearance(Array.from({length:12},(_,i)=>({name:`b${i}`,min:[1+(11-i)*.01,0,0],max:[2,1,1]})),[0,0,0],{...view,marginM:0});assert.equal(crowd.violations.length,8);assert.deepEqual(crowd.violations.map(v=>v.name),['b11','b10','b9','b8','b7','b6','b5','b4'],'the nearest eight, nearest first, whatever the order of the boxes');
 assert.equal(crowd.violationCount,12,'all twelve are counted though eight are listed');assert.match(crowd.reason,/is cut by 12 bounding box\(es\), the nearest b11 at 1\.000 m$/);assert.equal(crowd.nearest.name,'b11');assert.equal(r.violationCount,1);assert.equal(at(1.6,0).violationCount,0);
 assert.deepEqual(F.checkNearClearance([{name:'plank',min:[1.2,0,0],max:[2,1,1]},{name:'room',min:[-1,-1,-1],max:[1,1,1]}],[0,0,0],{...view,marginM:0}).violations.map(v=>v.name),['room','plank'],'the box the eye is inside comes first');
 // a box exactly as far as the ball and the margin need (a view of no angle makes the ball the near distance itself, so the sum is exact) is clear; a hair nearer is cut
 const exact={near:1,fov:0,aspect:1,marginM:.5},edge=x=>F.checkNearClearance([{name:'edge',min:[x,0,0],max:[x+1,1,1]}],[0,.5,.5],exact);
 assert.equal(F.nearClipRadius(exact),1);assert.equal(edge(1.5).ok,true,'exactly at the limit is clear');assert.equal(edge(1.5).violationCount,0);assert.equal(edge(1.5-1e-9).ok,false,'a nanometre inside it is cut');
 const none=F.checkNearClearance([],[0,0,0],{...view,marginM:0});assert.equal(none.ok,false);assert.equal(none.reason,'the specimen has no visible geometry to clear');assert.equal(none.minDistanceM,null);assert.equal(none.nearest,null);
});

check('the bogie readings are the levels and distances THREE gives once the LODs are updated, for the cars as the clip poses them, and only the visible bogies are read',()=>{
 const kind='gn387x4',plan=plans.get(kind),poses=C.motionPoses(formations.get(kind),plan),group=built(kind),camera=cameraOf(plan);
 for(const i of [0,5,6,8,10,15]) {
  F.applyCarPoses(group,poses.frames[i].cars);renderLods(group,camera);
  const lods=F.readBogieLods(T,group,camera);
  assert.deepEqual(lods.map(b=>b.name).sort(),plan.bogies.map(b=>b.name).sort(),`frame ${i}`);
  for(const b of lods) {
   const t=plan.bogies.find(x=>x.name===b.name);
   assert.equal(b.level,t.level[i],`${b.name} frame ${i} level`);near(b.distanceM,t.distanceM[i],1e-9,`${b.name} frame ${i} distance`);assert.equal(b.consistent,true);assert.deepEqual([b.car,b.k],[t.car,t.k]);
   assert.deepEqual(b.levels.map(l=>[l.lod,l.fromM,l.drawCalls]),[['near',0,1],['far',150,1]]);assert.deepEqual(b.levels.map(l=>l.visible),[b.level===0,b.level===1]);
   assert.ok(b.levels[1].triangles>0&&b.levels[1].triangles<b.levels[0].triangles,'the bare bogie draws fewer triangles than the full one');
   vec(b.world,[0,0,plan.frames[i].noseZ+t.z],1e-9,`${b.name} world position`);
  }
 }
 // THREE divides by the camera zoom, and so does the reading
 camera.zoom=2;camera.updateProjectionMatrix();F.applyCarPoses(group,poses.frames[3].cars);renderLods(group,camera);
 for(const b of F.readBogieLods(T,group,camera))near(b.distanceM,plan.bogies.find(x=>x.name===b.name).distanceM[3]/2,1e-9,`${b.name} at zoom 2`);
 camera.zoom=1;camera.updateProjectionMatrix();
 // a bogie the camera cannot see is still read (the renderer updates every LOD it walks), and its frame flag says so; a hidden car's bogies are not read
 F.applyCarPoses(group,poses.frames[0].cars);renderLods(group,camera);
 const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let inside=0,outside=0;
 for(const i of [0,1,2,6,15]) {
  F.applyCarPoses(group,poses.frames[i].cars);renderLods(group,camera);
  for(const b of F.readBogieLods(T,group,camera)) {const expected=frustum.containsPoint(new T.Vector3(...b.world));assert.equal(b.inFrame,expected,`frame ${i} ${b.name} at ${b.world}`);if(expected)inside++;else outside++;}
 }
 assert.ok(inside>10&&outside>=5,`the frustum test is not vacuous: ${inside} inside, ${outside} outside`);
 F.applyCarPoses(group,poses.frames[0].cars);renderLods(group,camera);
 const behind=F.readBogieLods(T,group,camera).filter(b=>b.world[2]>0);assert.ok(behind.length>0&&behind.every(b=>!b.inFrame),'a bogie behind the camera is not in its frame');
 assert.ok(F.readBogieLods(T,group,camera).some(b=>b.world[2]<-30&&b.inFrame),'one far ahead of it is');
 group.getObjectByName('car-1').visible=false;assert.deepEqual(F.readBogieLods(T,group,camera).map(b=>b.car).filter((c,i,a)=>a.indexOf(c)===i),[0,2,3]);
 // a bogie whose shown meshes are not the level it reports is flagged, and so is a missing LOD name
 group.getObjectByName('car-1').visible=true;const lod=group.getObjectByName('bogie-0-0').getObjectByName('bogie-lod');lod.levels[1].object.visible=true;
 assert.equal(F.readBogieLods(T,group,camera).find(b=>b.name==='bogie-0-0').consistent,false,'both meshes shown');lod.levels[0].object.visible=false;lod.levels[1].object.visible=false;assert.equal(F.readBogieLods(T,group,camera).find(b=>b.name==='bogie-0-0').consistent,false,'none shown');
 // exactly one mesh shown is still not enough: it must be the one the level names
 const reported=F.readBogieLods(T,group,camera).find(b=>b.name==='bogie-0-0').level,consistent=()=>F.readBogieLods(T,group,camera).find(b=>b.name==='bogie-0-0').consistent;
 lod.levels.forEach((l,n)=>{l.object.visible=n===1-reported;});assert.equal(consistent(),false,'one mesh shown, but the other level\'s');
 lod.levels.forEach((l,n)=>{l.object.visible=n===reported;});assert.equal(consistent(),true,'and the level\'s own mesh alone is consistent');
 // the readings are of the scene as it stands, not as it was when it was last updated: a camera or a train moved since is read where it is now
 const before=F.readBogieLods(T,group,camera).find(b=>b.name==='bogie-1-0');
 camera.position.x+=2;camera.position.z-=3;
 near(F.readBogieLods(T,group,camera).find(b=>b.name==='bogie-1-0').distanceM,Math.hypot(before.world[0]-camera.position.x,before.world[1]-camera.position.y,before.world[2]-camera.position.z),1e-9,'the camera is read where it is now');
 camera.position.x-=2;camera.position.z+=3;camera.updateMatrixWorld(true);
 group.position.z+=7;vec(F.readBogieLods(T,group,camera).find(b=>b.name==='bogie-1-0').world,[before.world[0],before.world[1],before.world[2]+7],1e-9,'the train is read where it is now');group.position.z-=7;group.updateMatrixWorld(true);
 // in the frame is between the near and far planes and inside the sides: a bogie between the camera and its near plane, behind it, past the far plane, beside it, above it or below it is not
 const eyeFor=(world,offset,far=9000)=>{const c=new T.PerspectiveCamera(50,1.6,1,far);c.position.set(world[0]+offset[0],world[1]+offset[1],world[2]+offset[2]);c.updateMatrixWorld(true);return c;};
 const seen=(offset,far)=>F.readBogieLods(T,group,eyeFor(before.world,offset,far)).find(b=>b.name==='bogie-1-0').inFrame;
 assert.equal(seen([0,0,10]),true,'dead ahead');assert.equal(seen([1,.5,10]),true,'a little off the axis');assert.equal(seen([0,0,.5]),false,'half a metre from the camera, closer than its near plane');assert.equal(seen([0,0,-10]),false,'behind the camera');assert.equal(seen([0,0,10],5),false,'past the far plane');
 assert.equal(seen([3.3,0,3]),false,'3 m ahead and 3.3 m to the left of a 73 degree wide view');assert.equal(seen([-3.3,0,3]),false,'and to the right');assert.equal(seen([0,5,3]),false,'3 m ahead and 5 m below the camera');assert.equal(seen([0,-5,3]),false,'and 5 m above it');
 const cab=F.leadingCabPoint(T,group);vec(cab.toArray(),[0,1.7,plan.frames[0].noseZ+1.5],1e-9);assert.throws(()=>F.leadingCabPoint(T,new T.Group()),/no car-0/);
 // the cab is on the first car: on a straight path every car sits at the same place, so another car out of line must leave the cab where it is, and the first car out of line takes it along
 const car0=group.getObjectByName('car-0'),car1=group.getObjectByName('car-1');
 car1.position.x+=1.25;vec(F.leadingCabPoint(T,group).toArray(),[0,1.7,plan.frames[0].noseZ+1.5],1e-9,'another car out of line leaves the cab where it is');car1.position.x-=1.25;
 car0.position.x+=.5;vec(F.leadingCabPoint(T,group).toArray(),[.5,1.7,plan.frames[0].noseZ+1.5],1e-9,'the first car out of line takes the cab with it');car0.position.x-=.5;
});

// ---- the verdicts on a frame and on the clip ---------------------------------------------------------------------------------------------------
const BASE=5000;
/** What a page would say about frame `i` if it drew exactly what the geometry predicts: each bogie 100 triangles and 2 draws full and 30 triangles and 1 draw bare, and BASE triangles and 20 draws besides the bogies. */
const perfectRead=(plan,i,cars)=>{
 const bogies=plan.bogies.map(t=>({name:t.name,car:t.car,k:t.k,level:t.level[i],distanceM:t.distanceM[i],world:[0,0,plan.frames[i].noseZ+t.z],consistent:true,
  levels:[{lod:'near',fromM:0,visible:t.level[i]===0,triangles:100,drawCalls:2},{lod:'far',fromM:150,visible:t.level[i]===1,triangles:30,drawCalls:1}],inFrame:true}));
 const shown=bogies.reduce((s,b)=>({triangles:s.triangles+b.levels[b.level].triangles,drawCalls:s.drawCalls+b.levels[b.level].drawCalls}),{triangles:0,drawCalls:0});
 return {bogies,clearance:{ok:true,reason:null},costs:{triangles:BASE+shown.triangles,drawCalls:20+shown.drawCalls},info:{calls:2*(20+shown.drawCalls),triangles:2*(BASE+shown.triangles),renders:2},cabDistanceM:plan.frames[i].cabDistanceM,
  cars:cars.map(c=>({name:`car-${c.index}`,visible:true,position:[c.position[0],0,c.position[1]],rotationY:c.rotationY,scaleZ:c.scaleZ}))};
};
const clipFrames=(plan,poses,tweak=()=>{})=>plan.frames.map(f=>{
 const cars=poses.frames[f.index].cars,read=perfectRead(plan,f.index,cars);tweak(read,f.index);
 return {index:f.index,number:f.number,status:'OK',reason:null,file:`x-${f.number}.png`,read,judged:safely(()=>F.judgeMotionFrame(plan,f.index,read,cars))};
});
/** The plan of gn387x4 and the cars of each of its frames, made when a test first asks for them. */
let fixtureMemo=null;
const fixtureOf=()=>fixtureMemo??=(()=>{const kind='gn387x4',plan=plans.get(kind);return {kind,plan,poses:safely(()=>C.motionPoses(formations.get(kind),plan))};})();

check('a frame read exactly as the geometry predicts has nothing to report, and each way the page can differ is named: a level, a distance, a level table, the meshes shown, the cab',()=>{
 const {plan,poses}=fixtureOf(),cars=poses.frames[6].cars,t=plan.bogies.find(b=>b.name==='bogie-1-0');
 const judge=(tweak,applied=cars,options)=>{const read=perfectRead(plan,6,cars);tweak(read);return safely(()=>F.judgeMotionFrame(plan,6,read,applied,options));};
 const of=(read,name)=>read.bogies.find(b=>b.name===name);
 const clean=judge(()=>{});
 assert.deepEqual([clean.gap,clean.mismatches,clean.problems],[null,[],[]]);assert.equal(clean.rows.length,8);assert.equal(clean.maxDistanceErrorM,0);assert.equal(clean.cabErrorM,0);assert.equal(clean.baseTriangles,BASE);
 assert.deepEqual(clean.rows.find(w=>w.name==='bogie-1-0'),{name:'bogie-1-0',car:1,k:0,level:t.level[6],distanceM:t.distanceM[6],predictedLevel:t.level[6],predictedDistanceM:t.distanceM[6],errorM:0,triangles:t.level[6]===0?100:30,inFrame:true});
 assert.deepEqual(clean.rows.map(w=>w.name),plan.bogies.map(b=>b.name),'one row for each planned bogie, in plan order');
 assert.equal(judge(r=>{of(r,'bogie-1-0').inFrame=false;}).rows.find(w=>w.name==='bogie-1-0').inFrame,false,'the row says whether the bogie was in the camera\'s frame');
 // a level other than the one predicted
 const flipped=judge(r=>{const b=of(r,'bogie-2-1');b.level=1-b.level;b.levels.forEach((l,i)=>{l.visible=i===b.level;});});const u=plan.bogies.find(b=>b.name==='bogie-2-1');
 assert.deepEqual(flipped.mismatches,[{frame:6,bogie:'bogie-2-1',why:'level',predicted:{level:u.level[6],distanceM:u.distanceM[6]},read:{level:1-u.level[6],distanceM:u.distanceM[6]}}]);
 // a distance, to the tolerance 1e-6 m, which can be given
 const moved=(d,options)=>judge(r=>{of(r,'bogie-0-1').distanceM+=d;},cars,options).mismatches.map(m=>[m.bogie,m.why]);
 assert.deepEqual(moved(2e-6),[['bogie-0-1','distance']]);assert.deepEqual(moved(-2e-6),[['bogie-0-1','distance']]);assert.deepEqual(moved(5e-7),[]);assert.deepEqual(moved(2e-6,{toleranceM:1e-3}),[]);assert.deepEqual(moved(5e-7,{toleranceM:1e-9}),[['bogie-0-1','distance']]);
 near(judge(r=>{of(r,'bogie-0-1').distanceM+=3e-7;}).maxDistanceErrorM,3e-7,1e-12);
 // the row of a bogie that was read a little out keeps both numbers: the one read and the one predicted, and the error between them
 const outRow=judge(r=>{of(r,'bogie-0-1').distanceM+=2e-6;}).rows.find(w=>w.name==='bogie-0-1'),p01=plan.bogies.find(b=>b.name==='bogie-0-1');
 assert.deepEqual([outRow.predictedDistanceM,outRow.distanceM],[p01.distanceM[6],p01.distanceM[6]+2e-6]);near(outRow.errorM,2e-6,1e-12);
 assert.deepEqual(judge(r=>{of(r,'bogie-0-1').distanceM=NaN;}).mismatches.map(m=>m.why),['distance'],'a distance that is not a number is a difference, not a pass');
 // the level table must be [0, 150] metres, two levels
 const table=(change)=>judge(r=>change(of(r,'bogie-3-0'))).mismatches;
 assert.deepEqual(table(b=>{b.levels[1].fromM=100;}),[{frame:6,bogie:'bogie-3-0',why:'level table',predicted:{fromM:[0,150]},read:{fromM:[0,100]}}]);
 assert.deepEqual(table(b=>{b.levels[0].fromM=1;}).map(m=>m.why),['level table']);assert.deepEqual(table(b=>{b.levels.pop();}).map(m=>m.why),['level table']);assert.deepEqual(table(b=>{b.levels.push({...b.levels[1]});}).map(m=>m.why),['level table']);
 // the meshes shown must be exactly the one the level names
 const shown=judge(r=>{of(r,'bogie-3-1').consistent=false;of(r,'bogie-3-1').levels.forEach(l=>{l.visible=true;});}).mismatches;const w=plan.bogies.find(b=>b.name==='bogie-3-1');
 assert.deepEqual(shown,[{frame:6,bogie:'bogie-3-1',why:'meshes shown',predicted:{level:w.level[6],distanceM:w.distanceM[6]},read:{level:w.level[6],distanceM:w.distanceM[6],shown:[true,true]}}]);
 // the leading cab, measured from the same camera
 const cab=judge(r=>{r.cabDistanceM+=1e-5;});assert.deepEqual(cab.mismatches,[{frame:6,bogie:null,why:'cab distance',predicted:{distanceM:plan.frames[6].cabDistanceM},read:{distanceM:plan.frames[6].cabDistanceM+1e-5}}]);near(cab.cabErrorM,1e-5,1e-9);
 assert.deepEqual(judge(r=>{r.cabDistanceM+=5e-7;}).mismatches,[]);assert.deepEqual(judge(r=>{r.cabDistanceM=NaN;}).mismatches.map(m=>m.why),['cab distance'],'a cab distance that is not a number is a difference, not a pass');
 // the triangles of the train besides its bogies come from the readings
 assert.equal(judge(r=>{r.costs.triangles+=7;}).baseTriangles,BASE+7);assert.equal(judge(r=>{of(r,'bogie-0-0').levels.length=1;of(r,'bogie-0-0').level=1;}).baseTriangles,null,'a bogie whose level has no mesh to count leaves the base unknown');
});

check('a page that is not in the state it was asked to be in is a problem, not a mismatch: a bogie missing, twice or unplanned, a car not where it was put; and a cut near plane is the frame\'s gap',()=>{
 const {plan,poses}=fixtureOf(),cars=poses.frames[6].cars,judge=(tweak,applied=cars)=>{const read=perfectRead(plan,6,cars);tweak(read);return safely(()=>F.judgeMotionFrame(plan,6,read,applied));};
 assert.deepEqual(judge(r=>{r.bogies.push({...r.bogies[0]});}).problems,['the page reports bogie-0-0 twice']);
 assert.deepEqual(judge(r=>{r.bogies.push({...r.bogies[0],name:'bogie-9-9'});}).problems,['the page reports bogie-9-9, which the plan has not']);
 assert.deepEqual(judge(r=>{r.bogies.push({...r.bogies[0],name:''});}).problems,['the page reports an unnamed bogie, which the plan has not']);
 assert.deepEqual(judge(r=>{r.bogies.push({...r.bogies[0],name:''},{...r.bogies[0],name:''});}).problems,['the page reports an unnamed bogie, which the plan has not','the page reports an unnamed bogie twice','the page reports an unnamed bogie, which the plan has not']);
 const lost=judge(r=>{r.bogies=r.bogies.filter(b=>b.name!=='bogie-3-1');});assert.deepEqual(lost.problems,['the page reports no bogie-3-1']);assert.equal(lost.rows.length,7);assert.equal(lost.baseTriangles,null);
 assert.deepEqual(judge(r=>{r.cars.pop();}).problems,['the specimen has 3 cars, the capture posed 4']);assert.deepEqual(judge(r=>{r.cars.push({...r.cars[0],name:'car-4'});}).problems,['the specimen has 5 cars, the capture posed 4','car-4 is not where the capture put it']);
 const off=change=>judge(r=>change(r.cars[1])).problems;
 assert.deepEqual(off(c=>{c.position[0]+=1e-6;}),['car-1 is not where the capture put it']);assert.deepEqual(off(c=>{c.position[2]+=1e-6;}),['car-1 is not where the capture put it']);assert.deepEqual(off(c=>{c.rotationY+=1e-6;}),['car-1 is not where the capture put it']);
 assert.deepEqual(off(c=>{c.scaleZ+=1e-6;}),['car-1 is not where the capture put it']);assert.deepEqual(off(c=>{c.visible=false;}),['car-1 is not where the capture put it']);assert.deepEqual(off(c=>{c.name='car-9';}),['car-9 is not where the capture put it']);
 assert.deepEqual(off(c=>{c.position[0]+=5e-10;c.position[2]-=5e-10;c.rotationY+=5e-10;c.scaleZ-=5e-10;}),[],'a nanometre is the same place');assert.deepEqual(off(c=>{c.position[1]+=3;}),[],'the height is the page\'s own');
 assert.deepEqual(judge(r=>{r.cars=[];},null).problems,[],'the cars are not checked when none were asked for');assert.deepEqual(judge(r=>{r.cars=undefined;},null).problems,[]);assert.deepEqual(judge(r=>{r.cars=undefined;}).problems,['the specimen has 0 cars, the capture posed 4'],'no car list is no cars');
 // the near plane: the frame's gap is the clearance reason; the readings are still judged
 const cut=judge(r=>{r.clearance={ok:false,reason:'the near plane is cut by car-2/plank'};});assert.equal(cut.gap,'the near plane is cut by car-2/plank');assert.deepEqual([cut.mismatches,cut.problems],[[],[]]);
 assert.equal(judge(r=>{r.clearance={ok:true,reason:'ignored'};}).gap,null);
});

check('the clip is OK only if every frame is, every reading matched, each bogie changed level once at the planned frame, and the train drew the same besides its bogies in every frame',()=>{
 const {plan,poses}=fixtureOf(),make=tweak=>{const frames=clipFrames(plan,poses,tweak);return safely(()=>F.judgeMotionClip(plan,frames));};
 const ok=make();
 assert.deepEqual([ok.ok,ok.status,ok.reason,ok.mismatches,ok.maxDistanceErrorM],[true,'OK',null,[],0]);assert.equal(ok.flips.length,8);
 for(const x of ok.flips) {
  const p=plan.flips.find(q=>q.name===x.name);
  assert.deepEqual([x.nearToFar,x.farToNear,x.firstFarIndex,x.lastNearIndex,x.plannedFirstFarIndex,x.equal],[1,0,p.firstFarIndex,p.firstFarIndex-1,p.firstFarIndex,true],x.name);near(x.lastNearDistanceM,p.nearDistanceM,1e-12);near(x.firstFarDistanceM,p.farDistanceM,1e-12);
 }
 assert.deepEqual(ok.flips.map(x=>x.name),plan.flips.map(x=>x.name),'in plan order');
 // the costs: the bogies at both levels from the first reading, the whole train all full and all bare, what the switch saves, and every frame
 assert.deepEqual([ok.costs.baseTriangles,ok.costs.baseTrianglesEqual],[BASE,true]);assert.equal(ok.costs.perBogie.length,8);
 assert.deepEqual(ok.costs.perBogie[3],{name:plan.bogies[3].name,near:{triangles:100,drawCalls:2},far:{triangles:30,drawCalls:1}});
 assert.deepEqual(ok.costs.allNear,{index:0,triangles:BASE+800,drawCalls:20+16});assert.deepEqual(ok.costs.allBare,{index:15,triangles:BASE+240,drawCalls:20+8});assert.deepEqual([ok.costs.savedTriangles,ok.costs.savedDrawCalls],[560,8]);
 const full9=plan.bogies.filter(b=>b.level[9]===0).length,calls9=20+2*full9+(8-full9);
 assert.ok(full9>0&&full9<8,'at frame 10 some of the bogies are bare and some are not');
 assert.equal(ok.costs.perFrame.length,16);assert.deepEqual(ok.costs.perFrame[9],{index:9,triangles:BASE+100*full9+30*(8-full9),drawCalls:calls9,rendererInfo:{calls:2*calls9,triangles:2*(BASE+100*full9+30*(8-full9)),renders:2},baseTriangles:BASE});
 assert.ok(ok.costs.perFrame[0].triangles>ok.costs.perFrame[15].triangles,'the bogies draw fewer triangles once they are bare');
 const first=plan.bogies[0].name,firstFlip=plan.flips[0].firstFarIndex;
 // a frame that is not a picture of the clip makes it a GAP, with the frame and the reason
 const frames=clipFrames(plan,poses);frames[4].status='GAP';frames[4].reason='picture shows no specimen: only 0 pixels differ from the empty stage (need 30)';
 const gap=safely(()=>F.judgeMotionClip(plan,frames));assert.deepEqual([gap.ok,gap.status],[false,'GAP']);assert.equal(gap.reason,'1 frame(s) are GAP: frame 5 picture shows no specimen: only 0 pixels differ from the empty stage (need 30)');
 const five=clipFrames(plan,poses);for(const i of [0,2,4,6,8]){five[i].status='GAP';five[i].reason=`r${i}`;}assert.equal(safely(()=>F.judgeMotionClip(plan,five)).reason,'5 frame(s) are GAP: frame 1 r0; frame 3 r2; frame 5 r4','only the first three are listed');
 // a reading that differs from the geometry fails the clip
 const read=make((r,i)=>{if(i===3)r.bogies.find(b=>b.name===first).distanceM+=.01;});assert.equal(read.ok,false);assert.equal(read.mismatches.length,1);assert.equal(read.reason,`1 reading(s) differ from the schedule predicted from the geometry: frame 4 ${first} distance`);near(read.maxDistanceErrorM,.01,1e-9);
 const many=make((r,i)=>{if(i<4)r.bogies.find(b=>b.name===first).distanceM+=.01;});assert.equal(many.reason,`4 reading(s) differ from the schedule predicted from the geometry: frame 1 ${first} distance; frame 2 ${first} distance; frame 3 ${first} distance`);
 const cab=make((r,i)=>{if(i===9)r.cabDistanceM+=1;});assert.match(cab.reason,/^1 reading\(s\) differ from the schedule predicted from the geometry: frame 10 cab cab distance$/);
 // a bogie that changes level a frame early: the level at the frame differs, and so does the flip
 const early=make((r,i)=>{if(i===firstFlip-1){const b=r.bogies.find(x=>x.name===first);b.level=1;b.levels.forEach((l,n)=>{l.visible=n===1;});}});
 const e=early.flips.find(x=>x.name===first);assert.deepEqual([e.nearToFar,e.farToNear,e.firstFarIndex,e.plannedFirstFarIndex,e.equal],[1,0,firstFlip-1,firstFlip,false]);
 assert.match(early.reason,new RegExp(`${first} was read changing to bare 1 times \\(first at frame ${firstFlip}\\) and back 0 times, the plan says once at frame ${firstFlip+1}`));assert.equal(early.ok,false);
 // twice to bare and once back; and never
 const twice=make((r,i)=>{const b=r.bogies.find(x=>x.name===first);const level=[0,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1][i];b.level=level;b.levels.forEach((l,n)=>{l.visible=n===level;});});
 const tw=twice.flips.find(x=>x.name===first);assert.deepEqual([tw.nearToFar,tw.farToNear,tw.firstFarIndex,tw.lastNearIndex],[2,1,2,1]);assert.match(twice.reason,new RegExp(`${first} was read changing to bare 2 times \\(first at frame 3\\) and back 1 times, the plan says once at frame ${firstFlip+1}`));
 const stayNear=r=>{const b=r.bogies.find(x=>x.name===first);b.level=0;b.levels.forEach((l,n)=>{l.visible=n===0;});},neverClip=make(stayNear),never=neverClip.flips.find(x=>x.name===first);
 assert.deepEqual([never.nearToFar,never.firstFarIndex,never.lastNearIndex,never.lastNearDistanceM,never.firstFarDistanceM,never.equal],[0,null,null,null,null,false]);
 assert.match(neverClip.reason,/was read changing to bare 0 times \(first at frame never\) and back 0 times/);assert.deepEqual([neverClip.costs.allBare,neverClip.costs.savedTriangles,neverClip.costs.savedDrawCalls],[null,null,null],'the last frame is not all bare, so there is no saving to report');
 // a bogie that starts bare, is full again and goes bare at the planned frame has changed level twice, not once; one the page did not report before that frame has not been seen to change
 const back=make((r,i)=>{const b=r.bogies.find(x=>x.name===first),level=i===0||i>=firstFlip?1:0;b.level=level;b.levels.forEach((l,n)=>{l.visible=n===level;});}),bk=back.flips.find(x=>x.name===first);
 assert.deepEqual([bk.nearToFar,bk.farToNear,bk.firstFarIndex,bk.equal,back.ok],[1,1,firstFlip,false,false]);assert.match(back.reason,new RegExp(`${first} was read changing to bare 1 times \\(first at frame ${firstFlip+1}\\) and back 1 times`));
 const unseen=make((r,i)=>{if(i<firstFlip)r.bogies=r.bogies.filter(x=>x.name!==first);}),un=unseen.flips.find(x=>x.name===first);
 assert.deepEqual([un.nearToFar,un.farToNear,un.firstFarIndex,un.equal,unseen.ok],[1,0,firstFlip,false,false]);
 // what a bogie costs at each level is what its first reading says, draw calls included
 const dearer=make((r,i)=>{if(i===0)r.bogies[3].levels[1].drawCalls=4;});assert.deepEqual(dearer.costs.perBogie[3],{name:plan.bogies[3].name,near:{triangles:100,drawCalls:2},far:{triangles:30,drawCalls:4}});
 // the same level in the bogie and the meshes drawn: the triangles besides the bogies are the same in every frame
 const base=make((r,i)=>{if(i===8)r.costs.triangles+=12;});assert.equal(base.ok,false);assert.deepEqual([base.costs.baseTriangles,base.costs.baseTrianglesEqual],[null,false]);
 assert.match(base.reason,/^the triangles drawn besides the bogies differ between frames \(5000, 5012\), so the levels reported are not the meshes drawn$/);
 const lostAll=make(r=>{r.bogies=r.bogies.filter(b=>b.name!=='bogie-3-1');});assert.deepEqual([lostAll.costs.baseTriangles,lostAll.costs.baseTrianglesEqual],[null,false],'a base that is unknown in every frame is not an equal base');
 const noRows=make((r,i)=>{if(i===0)r.bogies=[];});assert.equal(noRows.costs.allNear,null,'a first frame in which no bogie was read is not one in which every bogie is full');
 // the problems of a frame are the clip's, numbered from 1; at most three are listed
 const dup=make((r,i)=>{if(i===2)r.bogies.push({...r.bogies[0]});});assert.equal(dup.ok,false);assert.match(dup.reason,/^frame 3: the page reports bogie-0-0 twice/);
 assert.equal(make((r,i)=>{r.bogies.push({...r.bogies[0]});}).reason.split('; ').length,3,'three problems are listed of sixteen');
 // the frames the capture has must be the frames of the plan
 const short=safely(()=>F.judgeMotionClip(plan,clipFrames(plan,poses).slice(0,15)));assert.equal(short.ok,false);assert.match(short.reason,/^the clip has 15 frames, the plan 16; /);assert.ok(short.flips.every(x=>!x.equal),'with a frame missing no flip is confirmed');
 const none=safely(()=>F.judgeMotionClip(plan,[]));assert.deepEqual([none.ok,none.status,none.maxDistanceErrorM,none.costs.allNear,none.costs.allBare,none.costs.savedTriangles,none.costs.perBogie,none.costs.baseTrianglesEqual],[false,'GAP',0,null,null,null,[],false]);assert.match(none.reason,/the clip has 0 frames, the plan 16/);
});

// ---- the pictures: a PNG encoder and a contact sheet -------------------------------------------------------------------------------------------
const pngChunks=bytes=>{const out=[];for(let i=8;i<bytes.length;){const length=bytes.readUInt32BE(i),type=bytes.toString('ascii',i+4,i+8),data=bytes.subarray(i+8,i+8+length);out.push({type,data,crc:bytes.readUInt32BE(i+8+length),computed:crc32(bytes.subarray(i+4,i+8+length))>>>0});i+=12+length;}return out;};
const solid=(width,height,[r,g,b])=>{const pixels=Buffer.alloc(width*height*3);for(let i=0;i<width*height;i++){pixels[i*3]=r;pixels[i*3+1]=g;pixels[i*3+2]=b;}return {width,height,channels:3,pixels};};
const pixelAt=(image,x,y)=>[...image.pixels.subarray((y*image.width+x)*image.channels,(y*image.width+x)*image.channels+3)];

check('the PNG encoder writes a signature, a header, unfiltered rows in one data chunk and an end chunk, each with its CRC, and readPng reads back what was written',()=>{
 const pixels=Buffer.from(Array.from({length:7*5*3},(_,i)=>(i*37+11)&255)),png=C.encodePng({width:7,height:5,channels:3,pixels});
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const parts=pngChunks(png);assert.deepEqual(parts.map(c=>c.type),['IHDR','IDAT','IEND']);for(const c of parts)assert.equal(c.crc,c.computed,`${c.type} CRC`);
 assert.deepEqual([parts[0].data.length,parts[0].data.readUInt32BE(0),parts[0].data.readUInt32BE(4),...parts[0].data.subarray(8)],[13,7,5,8,2,0,0,0]);assert.equal(parts[2].data.length,0);
 const raw=inflateSync(parts[1].data);assert.equal(raw.length,5*(1+21));for(let y=0;y<5;y++){assert.equal(raw[y*22],0,`row ${y} is unfiltered`);assert.deepEqual([...raw.subarray(y*22+1,y*22+22)],[...pixels.subarray(y*21,y*21+21)],`row ${y}`);}
 const back=readPng(png);assert.deepEqual([back.width,back.height,back.channels],[7,5,3]);assert.deepEqual([...back.pixels],[...pixels]);
 const rgba=Buffer.from(Array.from({length:3*2*4},(_,i)=>(i*53+7)&255)),png4=C.encodePng({width:3,height:2,channels:4,pixels:rgba}),h4=pngChunks(png4);
 assert.equal(h4[0].data[9],6);for(const c of h4)assert.equal(c.crc,c.computed);const back4=readPng(png4);assert.deepEqual([back4.width,back4.height,back4.channels,[...back4.pixels]],[3,2,4,[...rgba]]);
 assert.deepEqual([...readPng(C.encodePng({width:1,height:1,pixels:Buffer.from([1,2,3])})).pixels],[1,2,3],'three channels unless told otherwise');
 assert.ok(png.equals(C.encodePng({width:7,height:5,channels:3,pixels})),'the same image is the same bytes');
 // a sub-array of a bigger buffer is read from its own start
 const wide=Buffer.concat([Buffer.from([9,9,9]),pixels]);assert.ok(C.encodePng({width:7,height:5,pixels:wide.subarray(3)}).equals(png));
 const bad=[{width:0,height:2,channels:3,pixels:Buffer.alloc(0)},{width:3,height:0,channels:3,pixels:Buffer.alloc(0)},{width:3,height:2,channels:3,pixels:Buffer.alloc(17)},{width:3,height:2,channels:2,pixels:Buffer.alloc(12)},{width:1.5,height:2,channels:3,pixels:Buffer.alloc(9)},{width:3,height:-1,channels:3,pixels:Buffer.alloc(0)},{width:3,height:2.5,channels:3,pixels:Buffer.alloc(18)},{width:4,height:1.5,channels:3,pixels:Buffer.alloc(18)}];
 for(const args of bad)assert.throws(()=>C.encodePng(args),/the pixels are not width x height x channels bytes/);
});

check('downscaling takes the rounded mean of each block, drops the partial block at the edge and the alpha channel',()=>{
 const rgb=Buffer.from([0,10,255,1,20,255,100,0,0,200,0,1, 2,30,255,3,40,254,100,0,0,201,0,2]),out=C.downscale({width:4,height:2,channels:3,pixels:rgb},2);
 assert.deepEqual([out.width,out.height,out.channels,[...out.pixels]],[2,1,3,[2,25,255,150,0,1]],'1.5 rounds up to 2, 254.75 to 255, 150.25 to 150');
 const rgba=Buffer.from(rgb.reduce((a,v,i)=>{a.push(v);if(i%3===2)a.push(i%2?0:255);return a;},[])),viaAlpha=C.downscale({width:4,height:2,channels:4,pixels:rgba},2);assert.deepEqual([...viaAlpha.pixels],[2,25,255,150,0,1]);assert.equal(viaAlpha.channels,3);
 const odd=C.downscale({width:5,height:3,channels:3,pixels:Buffer.alloc(45,10)},2);assert.deepEqual([odd.width,odd.height,odd.pixels.length],[2,1,6]);
 const same=C.downscale({width:2,height:1,channels:3,pixels:Buffer.from([1,2,3,4,5,6])},1);assert.deepEqual([...same.pixels],[1,2,3,4,5,6]);
 const rows=C.downscale({width:2,height:4,channels:3,pixels:Buffer.from([...Array(6).fill(0),...Array(6).fill(40),...Array(6).fill(100),...Array(6).fill(200)])},2);assert.deepEqual([...rows.pixels],[20,20,20,150,150,150],'each block is its own two rows');
});

check('the contact sheet lays the frames out four to a row with a gap around each, marks every bogie that changes level on its frame, numbers the frames, and draws a frame that is not a picture as a grey tile',()=>{
 const glyphs=['111/101/101/101/111','010/110/010/010/111','111/001/111/100/111','111/001/111/001/111','101/101/111/001/001','111/100/111/001/111','111/100/111/101/111','111/001/001/001/001','111/101/111/101/111','111/101/111/001/111'];
 const flips=Array.from({length:16},(_,n)=>({5:2,6:1,9:3,15:1}[n]??0)),colour=n=>[10+n*12,90+n,200-n*5],gapAt=11;
 const frames=Array.from({length:16},(_,n)=>({number:n+1,image:n===gapAt?null:solid(400,250,colour(n)),flips:flips[n]}));
 const sheet=C.contactSheet(frames);
 assert.deepEqual([sheet.width,sheet.height,sheet.channels,sheet.pixels.length],[1640,1040,3,1640*1040*3]);assert.deepEqual(pixelAt(sheet,0,0),[32,38,46]);assert.deepEqual(pixelAt(sheet,1639,1039),[32,38,46]);assert.deepEqual(pixelAt(sheet,7,500),[32,38,46],'8 px of gap before the first tile');
 for(let n=0;n<16;n++) {
  const x0=8+(n%4)*408,y0=8+Math.floor(n/4)*258,expect=n===gapAt?[128,128,128]:colour(n);
  assert.deepEqual(pixelAt(sheet,x0+200,y0+125),expect,`tile ${n} centre`);assert.deepEqual(pixelAt(sheet,x0+399,y0),expect,`tile ${n} top right`);assert.deepEqual(pixelAt(sheet,x0+399,y0+249),expect,`tile ${n} bottom right`);
  assert.deepEqual(pixelAt(sheet,x0-1,y0+125),[32,38,46],`tile ${n} left gap`);assert.deepEqual(pixelAt(sheet,x0+400,y0+125),[32,38,46],`tile ${n} right gap`);assert.deepEqual(pixelAt(sheet,x0+200,y0-1),[32,38,46],`tile ${n} top gap`);assert.deepEqual(pixelAt(sheet,x0+200,y0+250),[32,38,46],`tile ${n} bottom gap`);
  // one orange square, 10 px, every 14 px along the top, a tick for each bogie first bare at this frame
  for(let i=0;i<4;i++) {
   const lit=i<flips[n];
   for(const [dx,dy] of [[0,0],[9,0],[0,9],[9,9],[5,5]])assert.deepEqual(pixelAt(sheet,x0+4+i*14+dx,y0+4+dy),lit?[255,140,0]:expect,`tile ${n} tick ${i} +${dx},${dy}`);
   assert.deepEqual(pixelAt(sheet,x0+4+i*14+10,y0+4),expect,`tile ${n} 4 px between tick ${i} and the next`);
  }
  assert.deepEqual(pixelAt(sheet,x0+3,y0+4),expect);assert.deepEqual(pixelAt(sheet,x0+4,y0+3),expect,'a tick starts 4 px in from the tile\'s corner');assert.deepEqual(pixelAt(sheet,x0+4,y0+14),expect,'and is 10 px square');
  // the frame number: white on a black box at the bottom left, three 3 x 5 cells wide a digit, each cell 3 px
  const text=String(n+1),by=y0+250-4-21;
  assert.deepEqual(pixelAt(sheet,x0+4,by),[0,0,0],`tile ${n} label corner`);assert.deepEqual(pixelAt(sheet,x0+4+(text.length*4+1)*3-1,by+20),[0,0,0]);assert.deepEqual(pixelAt(sheet,x0+4+(text.length*4+1)*3,by),expect,`tile ${n} label ends after its digits`);assert.deepEqual(pixelAt(sheet,x0+3,by),expect);assert.deepEqual(pixelAt(sheet,x0+4,by-1),expect);assert.deepEqual(pixelAt(sheet,x0+4,by+21),expect);
  [...text].forEach((digit,d)=>glyphs[Number(digit)].split('/').forEach((row,r)=>[...row].forEach((bit,c)=>{
   assert.deepEqual(pixelAt(sheet,x0+4+(1+d*4+c)*3+1,by+(1+r)*3+1),bit==='1'?[255,255,255]:[0,0,0],`tile ${n} (frame ${n+1}) digit ${digit} row ${r} col ${c}`);
   assert.deepEqual(pixelAt(sheet,x0+4+(1+d*4+c)*3,by+(1+r)*3+2),bit==='1'?[255,255,255]:[0,0,0]);assert.deepEqual(pixelAt(sheet,x0+4+(1+d*4+c)*3+2,by+(1+r)*3),bit==='1'?[255,255,255]:[0,0,0]);
  })));
 }
 // a picture twice the tile size is averaged down to it; one that is not a whole number of tiles is refused
 const wide=solid(800,500,[0,0,0]);for(let y=0;y<500;y++)for(let x=0;x<800;x+=2){const i=(y*800+x)*3;wide.pixels[i]=wide.pixels[i+1]=wide.pixels[i+2]=100;}
 assert.deepEqual(pixelAt(C.contactSheet([{number:1,image:wide,flips:0}]),8+200,8+125),[50,50,50]);
 for(const [w,h] of [[401,250],[400,251],[200,125],[600,375],[1200,500],[0,0]])assert.throws(()=>C.contactSheet([{number:3,image:solid(w,h,[1,2,3]),flips:0}]),new RegExp(`frame 3 is ${w}x${h}, not a whole number of times 400x250`),`${w}x${h}`);
 // other sizes: columns, tile size and gap are the options' (frames of 4 x 3 px, two to a row, a pixel apart)
 const small=C.contactSheet(Array.from({length:3},(_,n)=>({number:n+1,image:solid(4,3,[9,9,9]),flips:0})),{columns:2,tileWidth:4,tileHeight:3,gap:1});
 assert.deepEqual([small.width,small.height,small.pixels.length],[11,9,11*9*3]);assert.deepEqual(pixelAt(small,1,1),[9,9,9]);assert.deepEqual(pixelAt(small,0,0),[32,38,46]);assert.deepEqual(pixelAt(small,0,8),[32,38,46]);
 assert.equal(C.contactSheet([]).width,4*400+5*8);assert.equal(C.contactSheet([]).height,8,'no frames: no rows, one gap');
});

check('the cost of an object is counted over every mesh below it, shown or not, the way the static counter counts a train: draw range, indexes, material groups, invisible materials',()=>{
 const tri=n=>new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(new Array(n*9).fill(0),3));
 const plain=()=>new T.MeshBasicMaterial(),mesh=(geometry,material=plain())=>new T.Mesh(geometry,material);
 const indexed=tri(10).setIndex(Array.from({length:15},(_,i)=>i));
 assert.deepEqual(F.objectCost(mesh(tri(7))),{triangles:7,drawCalls:1});assert.deepEqual(F.objectCost(mesh(indexed)),{triangles:5,drawCalls:1},'30 vertices drawn through 15 indices are 5 triangles');
 const ranged=tri(10);ranged.setDrawRange(6,12);assert.deepEqual(F.objectCost(mesh(ranged)),{triangles:4,drawCalls:1},'the draw range, 12 indices from 6 = 4 triangles');
 const pastEnd=tri(4);pastEnd.setDrawRange(6,100);assert.deepEqual(F.objectCost(mesh(pastEnd)),{triangles:2,drawCalls:1},'a range past the end stops at it');
 const grouped=tri(9);grouped.addGroup(0,12,0);grouped.addGroup(12,6,1);grouped.addGroup(18,9,2);
 const off=new T.MeshBasicMaterial();off.visible=false;const clear=new T.MeshBasicMaterial({transparent:true,opacity:0});
 assert.deepEqual(F.objectCost(mesh(grouped,[plain(),plain(),plain()])),{triangles:9,drawCalls:3},'a draw for each material group');
 assert.deepEqual(F.objectCost(mesh(grouped,[plain(),off,plain()])),{triangles:7,drawCalls:2},'a group whose material is not visible is not drawn');
 assert.deepEqual(F.objectCost(mesh(grouped,[off,off,off])),{triangles:0,drawCalls:0});assert.deepEqual(F.objectCost(mesh(tri(3),clear)),{triangles:0,drawCalls:0},'a material with no opacity draws nothing');assert.deepEqual(F.objectCost(mesh(tri(3),[plain(),clear])),{triangles:3,drawCalls:1},'a group-less array counts as one draw when any of it shows');
 const none=mesh(tri(3));none.material=null;assert.deepEqual(F.objectCost(none),{triangles:0,drawCalls:0});assert.deepEqual(F.objectCost(mesh(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([],3)))),{triangles:0,drawCalls:0},'no vertices, no draw');
 const exhausted=tri(2);exhausted.setDrawRange(6,3);assert.deepEqual(F.objectCost(mesh(exhausted)),{triangles:0,drawCalls:0},'a draw range that starts at the end draws nothing');
 // a tree: the meshes below an object are added, a hidden one included by objectCost and left out by trainCosts, which counts what is drawn
 const root=new T.Group(),a=mesh(tri(2)),b=mesh(tri(3)),inner=new T.Group(),c=mesh(tri(4));inner.add(c);root.add(a,b,inner,new T.Object3D());b.visible=false;
 assert.deepEqual(F.objectCost(root),{triangles:9,drawCalls:3});assert.deepEqual(F.trainCosts(root),{triangles:6,drawCalls:2});inner.visible=false;assert.deepEqual(F.trainCosts(root),{triangles:2,drawCalls:1});assert.deepEqual(F.objectCost(root),{triangles:9,drawCalls:3});
 assert.deepEqual(F.objectCost(new T.Group()),{triangles:0,drawCalls:0});
});

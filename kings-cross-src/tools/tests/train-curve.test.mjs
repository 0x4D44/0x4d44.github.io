// C01, the curve (rubric-FROZEN-v1, opt-in): the route found on the page's smooth track, the frame it is put in, the page's own placement code over it, the numbers of every joint, the
// two views and the verdict. Geometry only: no page, no Chrome, no GPU (train-curve-page.test.mjs has the page). Tracks are made here; the page's own is read once, for the pins.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as T from 'three';
import {ALL_KINDS,trainLayout} from '../../core/train.ts';
import {SMOOTH_TURN,shapeFrom} from '../../core/curves.ts';
import {buildGraph,edgePoint} from '../../core/graph.ts';
import {carPoses} from '../../web/src/trains-live.ts';
import {END_GAP,bodySpec} from '../../web/src/train.ts';
import * as F from '../train-framing.mjs';
import * as C from '../train-capture.mjs';

/** Every test of this file is declared with `check`: an error thrown by the code under test is a failed assertion about it, whatever the error is. */
const check=(name,body)=>test(name,async t=>{try{await body(t);}catch(error){if(error instanceof assert.AssertionError)throw error;throw new assert.AssertionError({message:`${name}: threw ${error?.stack??error}`,operator:'check'});}});
const near=(a,b,tol=1e-6,note='')=>assert.ok(Math.abs(a-b)<=tol,`${note} ${a} is not ${b} (within ${tol})`);
const vec=(a,b,tol=1e-6,note='')=>{assert.equal(a.length,b.length,note);a.forEach((v,i)=>near(v,b[i],tol,`${note}[${i}]`));};
/** A call that must not throw: a mutated function that crashes fails an assertion in the test that called it, not the run of the file. */
const safely=work=>{let out;assert.doesNotThrow(()=>{out=work();});return out;};
const D2R=Math.PI/180;
const formations=new Map(ALL_KINDS.map(kind=>[kind,C.describeFormation(kind)]));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// ---- tracks made for the tests -----------------------------------------------------------------------------------------------------------------
/** The nodes and one way of an arc of radius `R` through (dx, dz), travelling north and bending right, a node every `spacing` metres of chord. */
const arcWay=({R=120,spacing=40,count=9,idBase=100,wayId=1,tunnel=false,dx=0,dz=0}={})=>{
  const step=spacing/R,ids=[],nodes=[];
  for(let i=0;i<count;i++){const phi=(i-(count-1)/2)*step,id=idBase+i;ids.push(id);nodes.push([id,dx+R-R*Math.cos(phi),dz-R*Math.sin(phi)]);}
  return {nodes,rails:[{id:wayId,nodes:ids,tunnel,service:'main'}]};
};
/** A way through points [x, z], ids from `idBase`. */
const polyWay=(points,{idBase=500,wayId=9,tunnel=false}={})=>({nodes:points.map((p,i)=>[idBase+i,p[0],p[1]]),rails:[{id:wayId,nodes:points.map((p,i)=>idBase+i),tunnel,service:'main'}]});
const merge=(...sets)=>({nodes:sets.flatMap(s=>s.nodes),rails:sets.flatMap(s=>s.rails)});
/** The curves the page draws for a track: what the capture hands the finder. */
const shapesOf=data=>{const g=buildGraph(data,{curves:true});return (a,b)=>shapeFrom(g.shapes,a,b);};
const find=(data,length,options={})=>safely(()=>F.findCurveRoute(data,length,{shapeOf:shapesOf(data),...options}));
const heading=(a,b)=>Math.atan2(b[0]-a[0],-(b[1]-a[1]));
/** Points along a straight run from `from` in direction `deg` (clockwise from north) every `step` metres, `n` pieces. */
const run=(from,deg,length)=>[from[0]+Math.sin(deg*D2R)*length,from[1]-Math.cos(deg*D2R)*length];

// ---- the numbers -------------------------------------------------------------------------------------------------------------------------------
check('C01 is one set of numbers for every kind: the baseline is the longest car, the cut is the page\'s smoothing rule, two views, an opt-in id',()=>{
 assert.deepEqual({...F.CURVE},{id:'C01',suffix:'curve',stage:'neutral-curve',baselineM:26,cutDeg:30,marginM:10,stepM:.5,fallbackRadiusM:100,arcStepM:2,fov:50,elevationDeg:35,padM:.3,bogieToleranceM:.01,placementToleranceM:1e-5});
 assert.ok(Object.isFrozen(F.CURVE));
 const longestCar=Math.max(...ALL_KINDS.flatMap(kind=>formations.get(kind).cars.map(c=>c.length)));
 assert.equal(F.CURVE.baselineM,longestCar,'the baseline is the longest car of any kind');
 near(F.CURVE.cutDeg*D2R,SMOOTH_TURN,1e-12,'a track that turns by more than this at a node is a corner on the page (core/curves.ts), not a curve');
 assert.deepEqual(F.CURVE_VIEWS,['curve-plan','curve-oblique']);assert.equal(F.CURVE_STAGE,'neutral-curve (scenery hidden)');
 assert.deepEqual(F.OPT_IN_VIEW_IDS,['M01','C01','C02']);assert.ok(!F.VIEW_IDS.includes('C01'),'the default views stay V01-V10');
 for(const word of ['edgePoint','core/curves.ts','carPoses','END_GAP','FINDING','day only','1 cm'])assert.ok(F.CURVE_RULE.includes(word),`the rule names ${word}`);
});

check('C02 is C01\'s second pose and has numbers of its own: a bend is 1 degree or more across the baseline, the band is 10%, the main lines count, and it is an opt-in id',()=>{
 assert.deepEqual({...F.CURVE_NORMAL},{id:'C02',suffix:'curve-normal',rule:F.CURVE_NORMAL_RULE,bendMinDeg:1,bandShare:.1,services:['main']});
 assert.ok(Object.isFrozen(F.CURVE_NORMAL)&&Object.isFrozen(F.CURVE_NORMAL.services));
 assert.deepEqual(F.CURVE_NORMAL_VIEWS,['curve-normal-plan','curve-normal-oblique']);assert.ok(Object.isFrozen(F.CURVE_NORMAL_VIEWS));
 assert.deepEqual(F.OPT_IN_VIEW_IDS,['M01','C01','C02']);assert.ok(!F.VIEW_IDS.includes('C02'),'the default views stay V01-V10');assert.deepEqual(F.ASKABLE_VIEW_IDS.slice(-3),['M01','C01','C02']);
 assert.notEqual(F.CURVE_NORMAL.id,F.CURVE.id);assert.notEqual(F.CURVE_NORMAL.suffix,F.CURVE.suffix);assert.notEqual(F.CURVE_NORMAL_RULE,F.CURVE_RULE);
 // the rule says how the radius was picked, from the track and not from a train, and what stands in when no stretch has it
 for(const word of ['C02','typical','median','1 degree','26 m','0.5 m','service main','10%','never from a train','synthetic','day only','information','carPoses','least mean'])assert.ok(F.CURVE_NORMAL_RULE.includes(word),`the rule names ${word}`);
 // and each number it gives is the number the search uses, in the place the rule gives it: 26 m is twice the baseline (the run of track the turn is read across, and the radius's numerator), 0.5 m twice the step
 // (the spacing of the positions, and the length of bend each stands for). A word-in-text check passes when only one of the two places of a number is wrong.
 assert.equal(F.CURVE.baselineM,26);assert.equal(F.CURVE.stepM,.5);
 for(const phrase of [`across the ${F.CURVE.baselineM} m of the longest car`,`at the radius ${F.CURVE.baselineM} m over its turn`,`every ${F.CURVE.stepM} m along each piece`,`stands for ${F.CURVE.stepM} m of bend`,`by ${F.CURVE_NORMAL.bendMinDeg} degree or more`,`within ${F.CURVE_NORMAL.bandShare*100}% of the typical one`])assert.ok(F.CURVE_NORMAL_RULE.includes(phrase),`the rule says: ${phrase}`);
});

check('the polyline helpers measure a path: the distance along it to each point, the segment a distance falls in, the point at a distance, and the distance from a point to it',()=>{
 const path=[[0,0],[3,4],[3,10],[-3,10]],cum=safely(()=>F.cumulative(path));
 vec(cum,[0,5,11,17],1e-12);assert.deepEqual(F.cumulative([[1,1]]),[0]);assert.deepEqual(F.cumulative([]),[0]);
 // a segment is [cum[i], cum[i+1]): a distance on a node belongs to the segment that starts there, before the start to the first, at or past the end to the last
 assert.deepEqual([-3,0,2.5,4.999,5,7,10.999,11,15,17,25].map(s=>safely(()=>F.segmentAt(cum,s))),[0,0,0,0,1,1,1,2,2,2,2]);
 assert.equal(F.segmentAt([0,5],3),0,'a path of one segment');assert.equal(F.segmentAt([0,5,9,20,26],19.999),2);assert.equal(F.segmentAt([0,5,9,20,26],20),3,'a longer path, to its last segment and the one before it');
 // the point at a distance: by the share of its segment; past either end the line of the end segment goes on
 vec(F.pointAlong(path,cum,2.5),[1.5,2],1e-12);vec(F.pointAlong(path,cum,5),[3,4],1e-12);vec(F.pointAlong(path,cum,8),[3,7],1e-12);vec(F.pointAlong(path,cum,14),[0,10],1e-12);vec(F.pointAlong(path,cum,0),[0,0],1e-12);vec(F.pointAlong(path,cum,17),[-3,10],1e-12);
 vec(F.pointAlong(path,cum,20),[-6,10],1e-12,'past the end the last segment goes on');vec(F.pointAlong(path,cum,-5),[-3,-4],1e-12,'and before the start the first goes back');
 // the distance from a point to the path: to the nearest part of any segment, whose ends are points
 near(F.polylineDistance(path,[1.5,2]),0,1e-12);near(F.polylineDistance(path,[4,0]),3.2,1e-12,'across a segment');near(F.polylineDistance(path,[-1,-1]),Math.SQRT2,1e-12,'past the start: the start');
 near(F.polylineDistance(path,[6,10]),3,1e-12,'past a corner');near(F.polylineDistance(path,[-5,10]),2,1e-12,'past the end: the end');near(F.polylineDistance(path,[3,7]),0,1e-12);near(F.polylineDistance(path,[1,10]),0,1e-12);near(F.polylineDistance(path,[0,12]),2,1e-12,'beside the last segment');near(F.polylineDistance(path,[-3,5]),5,1e-12,'not to the chord that would close the path');near(F.polylineDistance(path,[1.5,3]),.6,1e-12,'across its own segment, not to a point of it');
 near(F.polylineDistance([[1,1],[1,1],[4,1]],[2,2]),1,1e-12,'a segment of no length is a point');
});

// ---- the finder -------------------------------------------------------------------------------------------------------------------------------
/** The radius of the circle through three points of a route's curve, the tightest point and the two ends of the baseline either side of it: another way to the bend than the finder's heading change. */
const circumradius=route=>{
 const cum=F.cumulative(route.points),[a,b,c]=[-13,0,13].map(d=>F.pointAlong(route.points,cum,route.apexS+d)),side=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
 return side(a,b)*side(b,c)*side(a,c)/(4*Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2);
};
check('the finder measures the bend on the curve the page draws, not on the chords between the nodes',()=>{
 // nodes 40 m apart on an arc of 120 m: each node turns the chords by 19 degrees, while the page draws one smooth curve through them
 const data=arcWay({R:120,spacing:40,count:9}),smooth=find(data,100),chords=safely(()=>F.findCurveRoute(data,100));
 assert.equal(smooth.source,'real');assert.equal(smooth.smooth,true);assert.equal(chords.smooth,false);assert.equal(smooth.baselineM,26);
 const circle=circumradius(smooth);
 assert.ok(Math.abs(smooth.radiusM-circle)<.05*circle,`the radius is the drawn curve's: ${smooth.radiusM}, and three points of it say ${circle}`);
 near(smooth.turnDeg,26/smooth.radiusM/D2R,1e-4,'the turn and the radius are one measure');
 near(chords.radiusM,26/(40/120),.5,'on the chords the whole turn of a node (19.1 degrees) falls in one baseline');
 assert.ok(chords.radiusM<.7*circle,`the chords overstate the bend (${chords.radiusM} against ${circle})`);
 // the route is the curve: finer than the nodes, each node of its edges on it, and the straight chords of a route without curves have only the nodes
 assert.ok(smooth.points.length>smooth.steps.length*10,'sampled finely');
 for(const [id,x,z] of data.nodes){if(smooth.steps.some(s=>s.from===id||s.to===id)){const d=Math.min(...smooth.points.map(p=>Math.hypot(p[0]-x,p[1]-z)));assert.ok(d<1e-5,`node ${id} is on the route`);}}
 assert.equal(chords.points.length,chords.steps.length+1,'a route of chords has only its nodes');
 // a track drawn finely enough that the curve is the circle: the radius is the circle\'s, to the 0.5 degrees the page samples its curves by
 for(const R of [100,200]){const fine=find(arcWay({R,spacing:20,count:21}),100);assert.ok(Math.abs(fine.radiusM-R)<.03*R,`${R}: ${fine.radiusM}`);}
});

check('the route is whole edges of the curve, in the direction the chain was walked, holding the train with its margin each side of the tightest point',()=>{
 const data=arcWay({R:100,spacing:40,count:9}),L=60,route=find(data,L);
 const cum=F.cumulative(route.points),need=L/2+F.CURVE.marginM;
 near(route.lengthM,cum.at(-1),2e-6,'the length is the length of the points');
 assert.ok(route.apexS>=need-1e-6&&route.lengthM-route.apexS>=need-1e-6,'the margin and half the train fit either side of the tightest point');
 const on=route.steps[route.apexAt.step];
 near(route.apexS,cum[on.fromIndex]+route.apexAt.share*(cum[on.toIndex]-cum[on.fromIndex]),5e-7*(cum[on.toIndex]-cum[on.fromIndex])+2e-6,'apexAt says where on its edge, to the six places its share is given to');
 vec(F.pointAlong(route.points,cum,route.apexS),route.apex,2e-6,'the tightest point');
 route.steps.forEach((s,i)=>{
  if(i>0)assert.equal(s.from,route.steps[i-1].to,`step ${i} starts where step ${i-1} ends`);
  assert.equal(s.fromIndex,i?route.steps[i-1].toIndex:0);assert.ok(s.toIndex>s.fromIndex);
  const [a,b]=[route.points[s.fromIndex],route.points[s.toIndex]],node=id=>data.nodes.find(n=>n[0]===id);
  vec(a,node(s.from).slice(1),1e-5,'the edge starts at its node');vec(b,node(s.to).slice(1),1e-5,'and ends at its node');
  near(s.chordM,Math.hypot(a[0]-b[0],a[1]-b[1]),2e-6,'the chord is the edge\'s length on the page');
 });
 assert.equal(route.steps.at(-1).toIndex,route.points.length-1);assert.equal(route.steps[0].way,1);
 // walked from the lowest node: travelling in the direction of increasing ids
 assert.ok(route.steps[0].from<route.steps[0].to);
 assert.deepEqual(route.ways,[1]);assert.deepEqual(route.services,['main']);
 // the chain is the whole way: its nodes, its ends, and its length along the curves the page draws between them
 const shapes=shapesOf(data),drawn=data.nodes.slice(1).reduce((n,node,i)=>n+F.cumulative(shapes(data.nodes[i][0],node[0])).at(-1),0);
 near(route.chain.lengthM,drawn,2e-6,'the length of the chain');
 assert.deepEqual({...route.chain,lengthM:0},{lengthM:0,nodes:9,from:data.nodes[0].slice(1).map(v=>Math.round(v*1e6)/1e6),to:data.nodes[8].slice(1).map(v=>Math.round(v*1e6)/1e6)});
 assert.deepEqual(route.searched,{chains:1,pieces:1,fitting:1});
 assert.throws(()=>F.findCurveRoute(data,0),/a train 0 m long has no bend to find/);assert.throws(()=>F.findCurveRoute(data,-5),/no bend to find/);assert.throws(()=>F.findCurveRoute(data,NaN),/no bend to find/);
});

check('the tightest bend wins wherever it is in the file, and the file\'s order changes nothing',()=>{
 const wide=arcWay({R:200,spacing:20,count:21,idBase:100,wayId:1}),tight=arcWay({R:100,spacing:20,count:21,idBase:200,wayId:2,dx:3000});
 const data=merge(wide,tight),route=find(data,60);
 assert.deepEqual(route.ways,[2],'the 100 m bend, not the 200 m one');assert.ok(Math.abs(route.radiusM-100)<3,`${route.radiusM}`);
 assert.deepEqual(route.searched,{chains:2,pieces:2,fitting:2});
 const flipped={nodes:[...data.nodes].reverse(),rails:[...data.rails].reverse()};
 assert.deepEqual(find(flipped,60),route,'the order of nodes and ways in the file changes nothing');
 assert.deepEqual(find(merge(tight,wide),60),route);
 // the same two bends the other way round in the ids: still the tight one
 const swapped=merge(arcWay({R:100,spacing:20,count:21,idBase:100,wayId:1}),arcWay({R:200,spacing:20,count:21,idBase:200,wayId:2,dx:3000}));
 assert.deepEqual(find(swapped,60).ways,[1]);
 // a tie goes to the first chain walked, which is the one from the lowest node, whatever order the file lists them in
 const twin=merge(arcWay({R:100,spacing:20,count:21,idBase:100,wayId:5}),arcWay({R:100,spacing:20,count:21,idBase:300,wayId:3,dx:3000}));
 assert.deepEqual(find(twin,60).ways,[5],'equal bends: the chain that starts at the lowest node');
 assert.deepEqual(find({nodes:[...twin.nodes].reverse(),rails:[...twin.rails].reverse()},60).ways,[5]);
});

check('a corner is not a bend, a junction ends a chain, a bend too near the end of its chain cannot hold the train, and a train too long for every chain finds none',()=>{
 // a 90 degree corner between straights: the page draws a corner there, so there is no bend at all
 const corner=polyWay([[0,0],[0,-200],[0,-400],[200,-400],[400,-400]]);
 assert.equal(find(corner,60),null,'cut at the corner, both halves are straight');
 assert.equal(F.curveRouteFor(corner,60).source,'synthetic','and the synthetic arc stands in');
 // a turn of 29 degrees at a node is smoothed by the page and is a bend; 31 degrees is a corner
 const turn=deg=>polyWay([[0,0],run([0,0],0,200),run(run([0,0],0,200),deg,200),run(run(run([0,0],0,200),deg,200),deg,200)].slice(0,4));
 assert.ok(find(turn(29),60)!==null,'29 degrees is smoothed');assert.equal(find(turn(31),60),null,'31 degrees is a corner');
 // a bend near the end of its chain: 300 m of straight run into an arc of 150 m along its own tangent, which ends 180 m on
 const arc=arcWay({R:150,spacing:30,count:7,idBase:900,wayId:7}),[,x0,z0]=arc.nodes[0],phi0=-3*30/150,toward=[Math.sin(phi0),-Math.cos(phi0)];
 const lead=[300,150].map((s,k)=>[800+k,x0-toward[0]*s,z0-toward[1]*s]);
 const joined={nodes:[...lead,...arc.nodes],rails:[{id:7,nodes:[800,801,...arc.rails[0].nodes],tunnel:false,service:'main'}]};
 const small=find(joined,60),big=find(joined,360);
 assert.notEqual(small,null,'a short train fits the bend');assert.ok(small.turnDeg>8,`${small.turnDeg}`);
 assert.ok(big.turnDeg<.2*small.turnDeg,`a long train cannot centre on a bend in the last 90 m of its chain: ${big.turnDeg} against ${small.turnDeg} degrees`);
 assert.ok(big.apexS>=360/2+F.CURVE.marginM-1e-6&&big.lengthM-big.apexS>=360/2+F.CURVE.marginM-1e-6);
 assert.equal(find(joined,5000),null,'a train longer than every chain');
 // a junction ends the chain: with a branch off a node the piece after it begins there, and the train must fit beside the node
 const a=[0,0],b=run(a,0,200),c=run(b,20,200),d=run(c,20,200),kinked=polyWay([a,b,c,d]);
 const whole=find(kinked,60),branched={nodes:[...kinked.nodes,[900,b[0]+100,b[1]]],rails:[...kinked.rails,{id:2,nodes:[501,900],tunnel:false,service:'main'}]},split=find(branched,60);
 assert.ok(Math.hypot(whole.apex[0]-b[0],whole.apex[1]-b[1])<10,'without the branch the tightest point is by the kink');
 assert.ok(Math.hypot(split.apex[0]-b[0],split.apex[1]-b[1])>=60/2+F.CURVE.marginM-.1,'the junction ends the piece: the train and its margin must fit beside it');
 assert.ok(split.turnDeg<whole.turnDeg);assert.deepEqual([split.searched.chains,whole.searched.chains],[3,1]);
});

check('where the turn holds one value the tightest point is the middle of that run, and the first of two equal bends wins',()=>{
 // two kinks of 20 degrees in a straight chain of chords, 200 m of straight between them and around them
 const a=[0,0],b=run(a,0,200),c=run(b,20,200),d=run(c,20,200),e=run(d,40,200),f=run(e,40,200);
 const data=polyWay([a,b,c,d,e,f]),route=safely(()=>F.findCurveRoute(data,100));
 assert.equal(route.shapeOnly,undefined);near(route.turnDeg,20,1e-4);near(route.radiusM,26/(20*D2R),1e-4);
 const toKink=Math.hypot(route.apex[0]-b[0],route.apex[1]-b[1]);assert.ok(toKink<=.5,`the middle of the 26 m run that takes in the first kink is within a step of it (${toKink})`);
 // a second kink that turns more wins; one that turns the same does not
 const sharper=polyWay([a,b,c,d,run(d,45,200),run(run(d,45,200),45,200)]),second=safely(()=>F.findCurveRoute(sharper,100));
 assert.ok(Math.hypot(second.apex[0]-d[0],second.apex[1]-d[1])<=.5&&second.turnDeg>24);
 // no bend at all
 assert.equal(F.findCurveRoute(polyWay([[0,0],[0,-300],[0,-600]]),100),null,'a straight is no bend');
});

check('the route knows how much of its window is in a tunnel, and whether the tightest point is',()=>{
 const dry=find(arcWay({R:100,spacing:40,count:9}),60),wet=find(arcWay({R:100,spacing:40,count:9,tunnel:true}),60);
 assert.deepEqual(dry.tunnel,{apexInTunnel:false,windowM:0,fraction:0});
 assert.equal(wet.tunnel.apexInTunnel,true);near(wet.tunnel.windowM,60+2*F.CURVE.marginM,1e-5,'the window is the train and the margin each end');assert.equal(wet.tunnel.fraction,1);
 // a kink of 20 degrees at the node where a way on the surface becomes a way in a tunnel: the tightest point is by the node, so about half of the window is in the tunnel
 const a=[0,0],b=run(a,0,200),c=run(b,20,200),d=run(c,20,200),pts=[a,b,c,d].map((p,i)=>[500+i,p[0],p[1]]);
 const mixed=find({nodes:pts,rails:[{id:1,nodes:[500,501],tunnel:false,service:'main'},{id:2,nodes:[501,502,503],tunnel:true,service:'main'}]},60);
 assert.deepEqual(mixed.ways,[1,2]);assert.deepEqual(mixed.steps.map(s=>s.tunnel),[false,true]);
 // the tunnel length of the window, from the steps' own places along the points
 const cum=F.cumulative(mixed.points),need=60/2+F.CURVE.marginM,lo=Math.max(0,mixed.apexS-need),hi=Math.min(mixed.lengthM,mixed.apexS+need),inTunnel=mixed.steps.reduce((n,s)=>n+(s.tunnel?Math.max(0,Math.min(cum[s.toIndex],hi)-Math.max(cum[s.fromIndex],lo)):0),0);
 near(mixed.tunnel.windowM,inTunnel,2e-6);near(mixed.tunnel.fraction,inTunnel/(hi-lo),2e-6);assert.ok(mixed.tunnel.fraction>.3&&mixed.tunnel.fraction<.7,`about half (${mixed.tunnel.fraction})`);
 assert.equal(mixed.tunnel.apexInTunnel,mixed.steps[mixed.apexAt.step].tunnel,'the tightest point is on the edge apexAt names');
 // the tunnel flag is per way, so the other way round is the other half
 const flip=find({nodes:pts,rails:[{id:1,nodes:[500,501],tunnel:true,service:'main'},{id:2,nodes:[501,502,503],tunnel:false,service:'main'}]},60);
 near(flip.tunnel.fraction,1-mixed.tunnel.fraction,2e-6);assert.equal(flip.tunnel.apexInTunnel,!mixed.tunnel.apexInTunnel);
 // the tightest point is on an edge of its own: the route can begin on an edge of the other kind, and each edge keeps its way's service
 const R=120,ids=Array.from({length:8},(_,i)=>100+i),nodes=ids.map((id,i)=>{const phi=(i-3.5)*40/R;return [id,R-R*Math.cos(phi),-R*Math.sin(phi)];});
 for(const surface of [false,true]){
  const route=find({nodes,rails:[{id:1,nodes:ids.slice(0,2),tunnel:!surface,service:'main'},{id:2,nodes:ids.slice(1),tunnel:surface,service:'siding'}]},100),apexEdge=route.steps[route.apexAt.step];
  assert.notEqual(route.steps[0].tunnel,apexEdge.tunnel,'the first edge of the route and the edge of the tightest point are of different kinds');
  assert.equal(route.tunnel.apexInTunnel,apexEdge.tunnel,`the tightest point is on a ${apexEdge.tunnel?'tunnel':'surface'} edge`);
  assert.deepEqual(route.steps.map(s=>s.service),route.steps.map(s=>s.way===1?'main':'siding'));assert.deepEqual(route.services,['main','siding']);
 }
});

check('an edge the page does not draw is no edge of a route: one of no length or to a node the file lacks breaks the chain; a way with no flags is on the surface and has no service',()=>{
 const base=arcWay({R:100,spacing:20,count:21}),ids=base.rails[0].nodes,at110=base.nodes[10];
 const zero=find({nodes:[...base.nodes,[150,at110[1],at110[2]]],rails:[{...base.rails[0],nodes:[...ids.slice(0,11),150,...ids.slice(11)]}]},60);
 assert.equal(zero.searched.chains,2,'node 150 stands where node 110 does: the edge between them has no length and no direction');assert.ok(zero.steps.every(s=>s.chordM>0));
 const lost=find({nodes:base.nodes,rails:[{...base.rails[0],nodes:[...ids.slice(0,11),999,...ids.slice(11)]}]},60);
 assert.equal(lost.searched.chains,2,'node 999 is not in the file');assert.ok(lost.steps.every(s=>s.from!==999&&s.to!==999));
 const bare=find({nodes:base.nodes,rails:[{id:4,nodes:ids}]},60);
 assert.ok(bare.steps.length>0&&bare.steps.every(s=>s.tunnel===false&&s.service===null));assert.deepEqual(bare.services,[null]);assert.equal(bare.tunnel.apexInTunnel,false);assert.equal(bare.tunnel.windowM,0);
});

check('chains are walked from a junction in the order of their ways, whatever order the file lists them in, and of two equal bends the one walked first wins',()=>{
 // a junction at node 100 with a bend leaving it each way (mirror images, so exactly equal) and a short stub; the west way is listed toward the junction
 const R=100,n=20,on=(sign,i)=>[sign*R*Math.sin(i*20/R),R-R*Math.cos(i*20/R)],ids=base=>Array.from({length:n},(_,i)=>base+i+1),junction=[100,0,0];
 const east={nodes:ids(200).map((id,i)=>[id,...on(1,i+1)]),rails:[{id:5,nodes:[100,...ids(200)],tunnel:false,service:'main'}]};
 const west={nodes:ids(300).map((id,i)=>[id,...on(-1,i+1)]),rails:[{id:3,nodes:[...ids(300).reverse(),100],tunnel:false,service:'main'}]};
 const stub={nodes:[[700,0,-30]],rails:[{id:7,nodes:[100,700],tunnel:false,service:'main'}]};
 const [alone5,alone3]=[east,west].map(side=>find({nodes:[junction,...side.nodes],rails:side.rails},60));
 assert.deepEqual([alone5.turnDeg,alone5.apexS,alone5.radiusM],[alone3.turnDeg,alone3.apexS,alone3.radiusM],'the two bends are equal, one the mirror image of the other');
 for(const order of [[east,west,stub],[west,east,stub],[stub,west,east],[stub,east,west]]){
  const route=find({nodes:[junction,...east.nodes,...west.nodes,...stub.nodes],rails:order.flatMap(side=>side.rails)},60);
  assert.deepEqual(route.ways,[3],'way 3 is walked before way 5, which comes before way 7');assert.deepEqual(route.searched,{chains:3,pieces:3,fitting:2});
 }
});

check('a corner cuts a chain into pieces that keep the whole edges either side of it',()=>{
 const rounded=p=>p.map(v=>Math.round(v*1e6)/1e6);
 // a kink of 20 degrees after a corner of 45: the piece after the corner starts at the corner node and holds the kink
 const n0=[0,0],n1=run(n0,0,300),n2=run(n1,0,300),n3=run(n2,45,300),n4=run(n3,65,300),n5=run(n4,65,300);
 const after=safely(()=>F.findCurveRoute(polyWay([n0,n1,n2,n3,n4,n5]),60));
 assert.deepEqual(after.chain.from,rounded(n2));assert.equal(after.chain.nodes,4,'from the corner node to the end');assert.deepEqual(after.chain.to,rounded(n5));assert.equal(after.chain.lengthM,900);
 assert.deepEqual(after.searched,{chains:1,pieces:2,fitting:2});assert.deepEqual(after.steps.map(s=>[s.from,s.to]),[[502,503],[503,504]]);
 // and a kink before it: the piece that ends at the corner node holds the kink, and keeps the edge that ends there
 const m0=[0,0],m1=run(m0,0,300),m2=run(m1,20,300),m3=run(m2,40,300),m4=run(m3,85,300),m5=run(m4,85,300);
 const before=safely(()=>F.findCurveRoute(polyWay([m0,m1,m2,m3,m4,m5]),60));
 assert.deepEqual(before.chain.from,[0,0]);assert.equal(before.chain.nodes,4,'from the start to the corner node');assert.deepEqual(before.chain.to,rounded(m3));assert.equal(before.chain.lengthM,900);
 assert.deepEqual(before.searched,{chains:1,pieces:2,fitting:2});assert.deepEqual(before.steps.map(s=>[s.from,s.to]),[[500,501],[501,502]]);
});

check('a bend a hair sharper wins, in the same chain or in another, and a bend however gentle is still a bend',()=>{
 const a=[0,0],b=run(a,0,300),c=run(b,15,300),d=run(c,30.0005,300);
 const same=safely(()=>F.findCurveRoute(polyWay([a,b,c,d]),60));
 assert.equal(same.turnDeg,15.0005);assert.ok(Math.hypot(same.apex[0]-c[0],same.apex[1]-c[1])<=.5,'the second kink, which turns 0.0005 degrees more, not the first');
 const other=[3000,0],ob=run(other,0,300),oc=run(ob,15.0005,300);
 const two=safely(()=>F.findCurveRoute(merge(polyWay([a,b,run(b,15,300)],{idBase:100,wayId:1}),polyWay([other,ob,oc],{idBase:200,wayId:2})),60));
 assert.deepEqual(two.ways,[2],'the later chain, which turns 0.0005 degrees more');assert.equal(two.turnDeg,15.0005);
 const gentle=find(arcWay({R:6000,spacing:100,count:21}),100);
 assert.notEqual(gentle,null,'the bend of a very wide curve');assert.ok(gentle.turnDeg>0&&gentle.turnDeg<1,`${gentle.turnDeg}`);assert.ok(gentle.radiusM>1500,`${gentle.radiusM}`);
});

// ---- the scan, against another ---------------------------------------------------------------------------------------------------------------
/**
 * Another way to the same answer, for a track of one way: the drawn curve of the whole way (the page's own curve for each edge, joined), the heading change across the baseline at every
 * half metre from half the train and the margin in from each end, the first run of the greatest, and the edges the window around the middle of that run touches. Written longhand, not
 * from the finder's helpers.
 */
const wrapAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
/** The drawn curve of the first way of a data set (the page's own curve for each edge, joined, or the chords): the points, the distance to each, the heading of the segment a distance falls in, and the edges' extents. */
const drawn=(data,curved)=>{
 const ids=data.rails[0].nodes,pos=new Map(data.nodes.map(n=>[n[0],[n[1],n[2]]])),shapes=curved?shapesOf(data):null,dense=[],nodeAt=[0];
 ids.slice(0,-1).forEach((id,i)=>{(shapes?shapes(id,ids[i+1]):[pos.get(id),pos.get(ids[i+1])]).forEach((p,k)=>{if(i===0||k>0)dense.push(p);});nodeAt.push(dense.length-1);});
 const cum=[0];for(let i=1;i<dense.length;i++)cum.push(cum[i-1]+Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]));
 const headingAt=s=>{let i=0;while(i+2<dense.length&&cum[i+1]<=s)i++;return Math.atan2(dense[i+1][0]-dense[i][0],-(dense[i+1][1]-dense[i][1]));};
 return {total:cum.at(-1),headingAt,spans:ids.slice(0,-1).map((id,i)=>({from:id,to:ids[i+1],start:cum[nodeAt[i]],end:cum[nodeAt[i+1]]}))};
};
const scan=(data,length,{curved=true,baseline=26,margin=10,step=.5}={})=>{
 const {total,headingAt,spans}=drawn(data,curved),need=length/2+margin,turns=[];
 for(let s=need;s<=total-need+1e-9;s+=step)turns.push([s,Math.abs(wrapAngle(headingAt(s+baseline/2)-headingAt(s-baseline/2)))]);
 const top=Math.max(...turns.map(t=>t[1])),first=turns.findIndex(t=>t[1]>=top-1e-12);let last=first;while(last+1<turns.length&&turns[last+1][1]>=top-1e-12)last++;
 const apex=(turns[first][0]+turns[last][0])/2,lo=Math.max(0,apex-need),hi=Math.min(total,apex+need);
 return {turn:top,apex,spans,covered:spans.filter(e=>e.end>lo&&e.start<hi)};
};
check('the finder finds what a scan written another way finds: the greatest turn, the middle of its first run (also where the end of the scan cuts the run short) and the edges the window touches',()=>{
 const a=[0,0],b=run(a,0,300),c=run(b,20,60.5);
 const cases=[
  ['an arc of 120 m drawn through nodes 40 m apart',arcWay({R:120,spacing:40,count:9}),100,true],
  ['an arc of 100 m through nodes 20 m apart',arcWay({R:100,spacing:20,count:21}),60,true],
  ['chords with two kinks',polyWay([a,b,run(b,20,200),run(run(b,20,200),40,200)]),100,false],
  ['a kink 60 m before the end of its chain: the end of the scan cuts the run of the greatest turn short',polyWay([a,b,run(b,20,60)]),100,false],
  ['the same drawn smooth',polyWay([a,b,run(b,20,60)]),100,true],
  ['a window that ends 0.75 m before the next edge begins',polyWay([a,b,c,run(c,20,200)]),100,false],
  ['the same drawn smooth',polyWay([a,b,c,run(c,20,200)]),100,true],
  ['two kinks that differ by a hair',polyWay([a,b,run(b,15,300),run(run(b,15,300),30.0005,300)]),60,false],
 ];
 for(const [name,data,length,curved] of cases){
  const route=curved?find(data,length):safely(()=>F.findCurveRoute(data,length)),want=scan(data,length,{curved}),start=want.spans.find(e=>e.from===route.steps[0].from).start;
  near(route.turnDeg*D2R,want.turn,1e-7,`${name}: the turn`);
  near(start+route.apexS,want.apex,5e-6,`${name}: the tightest point`);
  assert.deepEqual(route.steps.map(s=>[s.from,s.to]),want.covered.map(e=>[e.from,e.to]),`${name}: the edges of the window`);
  for(const s of route.steps){const [p,q]=[s.from,s.to].map(id=>data.nodes.find(n=>n[0]===id));assert.equal(s.chordM,Math.round(Math.hypot(p[1]-q[1],p[2]-q[2])*1e6)/1e6,`${name}: a chord is given to a micrometre`);}
 }
 // two cases spelled out: the run cut short by the end of the scan is 287 to 300 m along, so its middle is 293.5; the window of 120 m ends 0.75 m before the third edge begins, so the route has two edges
 near(find(polyWay([a,b,run(b,20,60)]),100,{shapeOf:null}).apexS,293.5,1e-9);
 assert.equal(safely(()=>F.findCurveRoute(polyWay([a,b,c,run(c,20,200)]),100)).steps.length,2);
});

check('the synthetic arc is a circle of the radius asked for, north then right, labelled, with the tightest point a node at the origin',()=>{
 const arc=safely(()=>F.circularArcRoute(130,100));
 assert.equal(arc.source,'synthetic');assert.equal(arc.smooth,false);assert.equal(arc.steps,null);assert.equal(arc.apexAt,null);assert.equal(arc.chain,null);assert.equal(arc.searched,null);
 assert.match(arc.note,/^a synthetic circular arc of radius 100 m: no run of the page's track holds a train 130 m long on a bend$/);
 assert.deepEqual(arc.apex,[0,0]);assert.deepEqual(arc.tunnel,{apexInTunnel:false,windowM:0,fraction:0});assert.deepEqual([arc.ways,arc.services],[[],[]]);
 for(const p of arc.points){near(Math.hypot(p[0]-100,p[1]),100,2e-6,'on the circle of centre (100, 0)');for(const v of p)assert.equal(v,Math.round(v*1e6)/1e6,'to a micrometre');}
 assert.ok(arc.points[0][1]>0&&arc.points.at(-1)[1]<0,'travelling north: from +z to -z');assert.ok(arc.points.every(p=>p[0]>=-1e-9),'bending right: to +x');
 assert.equal(arc.points.length%2,1,'an even number of chords');vec(arc.points[arc.points.length-1>>1],[0,0],1e-9,'the middle node is the origin');near(arc.apexS,F.cumulative(arc.points)[arc.points.length-1>>1],2e-6);
 const half=130/2+F.CURVE.marginM;near(arc.lengthM,2*half,.05,'as long as the train and the margins');near(arc.turnDeg,26/100/D2R,F.CURVE.arcStepM/100/D2R,'to a chord of the arc (the headings are the chords\'');near(arc.radiusM,100,1e-9);
 const cum=F.cumulative(arc.points);for(let i=0;i+1<cum.length;i++)near(cum[i+1]-cum[i],cum.at(-1)/(cum.length-1),1e-4,'chords of one length');
 assert.ok(cum[1]-cum[0]<=F.CURVE.arcStepM+1e-9&&cum[1]-cum[0]>F.CURVE.arcStepM*.9);
 assert.throws(()=>F.circularArcRoute(0,100),/an arc of radius 100 m for a train 0 m long/);assert.throws(()=>F.circularArcRoute(100,0),/radius 0/);assert.throws(()=>F.circularArcRoute(100,-1),/radius -1/);assert.throws(()=>F.circularArcRoute(NaN,100));
 // curveRouteFor: the page's track if it has a bend, else this arc, at the radius it is given
 const none=F.curveRouteFor({nodes:[],rails:[]},130);assert.equal(none.source,'synthetic');near(none.radiusM,100,1e-9);
 assert.equal(F.curveRouteFor({nodes:[],rails:[]},130,{fallbackRadiusM:80}).radiusM,80);
 // the margin and the baseline are the search's, the arc's chords are its own: the step of the search does not change them
 const wide=F.curveRouteFor({nodes:[],rails:[]},130,{marginM:20,baselineM:20});near(wide.lengthM,130+2*20,.05);assert.equal(wide.baselineM,20);near(wide.turnDeg,20/100/D2R,F.CURVE.arcStepM/100/D2R);
 assert.deepEqual(F.curveRouteFor({nodes:[],rails:[]},130,{stepM:1}).points,none.points,'the step of the search is not the length of a chord');
 assert.ok(F.curveRouteFor({nodes:[],rails:[]},130,{arcStepM:5}).points.length<none.points.length,'but the length of a chord can be asked for');
 const real=F.curveRouteFor(arcWay({R:100}),60,{shapeOf:shapesOf(arcWay({R:100}))});assert.equal(real.source,'real');assert.ok(real.local&&real.local.points.length===real.points.length);
});

// ---- C02: the bend that is typical of the track -------------------------------------------------------------------------------------------------
/** A turn of `deg` degrees across the 26 m baseline, as the radius it stands for; and a number to a micrometre, as the tools give them. */
const RADIUS=deg=>26/(deg*D2R),q6=x=>Math.round(x*1e6)/1e6;
/**
 * A way of 400 m with one kink of `deg` degrees `lead` metres along it. `lead` is off the half-metre grid the positions stand on, so no window ends on the kink and float noise cannot move it
 * across one: exactly 52 positions have the kink inside the 26 m they look across, and they turn by exactly `deg`. `service: false` leaves the way without one.
 */
const kinked=(deg,{x0=0,idBase=500,wayId=9,lead=100.25,tunnel=false,service='main'}={})=>{
 const a=[x0,0],b=run(a,0,lead),way=polyWay([a,b,run(b,deg,400-lead)],{idBase,wayId,tunnel});
 for(const rail of way.rails){if(service===false)delete rail.service;else rail.service=service;}
 return way;
};
check('the typical radius is the median of the track\'s bend positions, each half a metre of track at the radius of its own turn across the baseline, the upper one of two middle ones',()=>{
 // two kinks in a way of 400 m, 200 m apart: 52 positions turn by 10 degrees and 52 by 20; the rest of the way is straight to the eye and is track, not bend
 const a=[0,0],b=run(a,0,100.25),c=run(b,10,200),data=polyWay([a,b,c,run(c,30,99.75)]),typical=safely(()=>F.typicalRadius(data));
 assert.deepEqual(typical,{radiusM:q6(RADIUS(10)),baselineM:26,bendMinDeg:1,services:['main'],stepM:.5,trackM:374.5,bendM:52,quartilesM:[q6(RADIUS(20)),q6(RADIUS(10))],pieces:1});
 assert.deepEqual(F.typicalRadius({nodes:[...data.nodes].reverse(),rails:[...data.rails].reverse()}),typical,'the order of the file changes nothing');
 // one of each: the median is the longer of the two radii, not the shorter and not their mean
 assert.ok(typical.radiusM>RADIUS(20)&&typical.radiusM<=RADIUS(10)+1e-6&&Math.abs(typical.radiusM-(RADIUS(10)+RADIUS(20))/2)>10);
 // weighted by the track: a bend of 10 degrees on one way and two of 20 on another, so 52 positions at the one radius and 104 at the other, and the typical radius is the one with the track, whichever way is the tighter
 const weighted=merge(kinked(10,{idBase:100,wayId:1}),polyWay([[3000,0],[3000,-100.25],run([3000,-100.25],20,50),run(run([3000,-100.25],20,50),40,249.75)],{idBase:200,wayId:2}));
 assert.equal(safely(()=>F.typicalRadius(weighted)).radiusM,q6(RADIUS(20)),'104 positions of 20 degrees outweigh 52 of 10, though each way has one kink of the one and the median of ways would be the wider');
 const outweighed=merge(kinked(20,{idBase:100,wayId:1}),polyWay([[3000,0],[3000,-100.25],run([3000,-100.25],10,50),run(run([3000,-100.25],10,50),20,249.75)],{idBase:200,wayId:2}));
 assert.equal(F.typicalRadius(outweighed).radiusM,q6(RADIUS(10)),'and the other way round');
});

check('the typical radius counts the ways of the services it is asked for, in a tunnel or not, and only those; the track it was taken on and the bend in it are given in metres',()=>{
 const ways=merge(kinked(10,{idBase:100,wayId:1}),kinked(20,{x0:2000,idBase:200,wayId:2,tunnel:true}),kinked(20,{x0:4000,idBase:300,wayId:3}),kinked(5,{x0:6000,idBase:400,wayId:4,service:'siding'}),kinked(25,{x0:8000,idBase:500,wayId:5,service:false}));
 const typical=(options={})=>safely(()=>F.typicalRadius(ways,options)),summary=t=>t&&[t.radiusM,t.trackM,t.bendM,t.pieces];
 // main: the surface 10, the tunnel 20 and the surface 20 (52, 104 positions, the tunnel one among them: without it the median would be 10 degrees); the siding and the way with no service are not counted
 assert.deepEqual(summary(typical()),[q6(RADIUS(20)),3*374.5,78,5],'by default the main lines, in a tunnel or not');
 assert.deepEqual(summary(typical({services:['main']})),summary(typical()));
 assert.deepEqual(summary(typical({services:['siding']})),[q6(RADIUS(5)),374.5,26,5]);
 assert.deepEqual(summary(typical({services:['main','siding']})),[q6(RADIUS(10)),4*374.5,104,5]);
 assert.deepEqual(summary(typical({services:[null]})),[q6(RADIUS(25)),374.5,26,5],'a way with no service is the service null');
 assert.deepEqual(typical({services:['main','siding']}).services,['main','siding']);assert.equal(typical({services:['ferry']}),null,'nothing of that service');assert.equal(typical({services:[]}),null);
 // the default list is the constant\'s, copied: a result does not hand the constant itself to whoever edits it
 const own=typical();own.services.push('x');assert.deepEqual(F.CURVE_NORMAL.services,['main']);
});

check('the typical radius takes a turn of the threshold or more for a bend, a baseline, a step and a corner cut of its own, and counts a position by the whole of the baseline on its piece',()=>{
 const a=[0,0],b=run(a,0,100.25),c=run(b,10,200),data=polyWay([a,b,c,run(c,30,99.75)]),typical=(options={},d=data)=>safely(()=>F.typicalRadius(d,options));
 // the threshold is inclusive: 10 degrees is a bend at 10 and not at 10.001, 20 at 20 and not at 20.001
 assert.deepEqual([typical({bendMinDeg:10}).radiusM,typical({bendMinDeg:10}).bendM],[q6(RADIUS(10)),52]);
 assert.deepEqual([typical({bendMinDeg:10.001}).radiusM,typical({bendMinDeg:10.001}).bendM],[q6(RADIUS(20)),26],'only the 20 degree kink');
 assert.deepEqual([typical({bendMinDeg:20}).radiusM,typical({bendMinDeg:20}).bendM],[q6(RADIUS(20)),26]);assert.equal(typical({bendMinDeg:20.001}),null);
 assert.notEqual(typical({bendMinDeg:1}),null,'the default is 1 degree');assert.equal(typical({bendMinDeg:1}).bendMinDeg,1);assert.equal(typical({bendMinDeg:15}).bendMinDeg,15);
 // 1 degree is a bend, a thousandth of a degree less is not
 assert.equal(typical({},kinked(1)).radiusM,q6(RADIUS(1)));assert.equal(typical({},kinked(.999)),null);
 // a step of a metre: half the positions, each standing for twice the track
 const metre=typical({stepM:1});assert.deepEqual([metre.stepM,metre.trackM,metre.bendM,metre.radiusM],[1,375,52,q6(RADIUS(10))]);
 // a baseline of 13 m: windows half as wide, so radii half as large and half as many positions look across a kink, and the positions begin at 6.5 m
 const half=typical({baselineM:13});assert.deepEqual([half.baselineM,half.radiusM,half.bendM,half.trackM],[13,q6(13/(10*D2R)),26,(Math.floor((400-13)/.5+1e-9)+1)*.5]);
 // a corner cut at 15 degrees: the kink of 20 is a corner, the way is two pieces, and no window looks across the corner
 const cut=typical({cutDeg:15});assert.deepEqual([cut.pieces,cut.radiusM,cut.bendM],[2,q6(RADIUS(10)),26]);assert.equal(typical().pieces,1);
 // a window must lie on its piece: a way shorter than the baseline has no position, one the baseline long (to a tenth of a nanometre) has one, one a hundredth of a micrometre short has none
 const around=(extra,leg=13)=>{const p=[0,0],q=[0,-13],r=run(q,20,leg+extra);return polyWay([p,q,r]);};
 assert.equal(typical({},around(0,12)),null,'24 m');
 const one=typical({},around(-1e-10));assert.deepEqual([one.trackM,one.bendM,one.radiusM],[.5,.5,q6(RADIUS(20))]);assert.equal(typical({},around(-1e-8)),null);
 const whole=typical({},around(0));assert.deepEqual([whole.trackM,whole.bendM],[.5,.5]);
 // a corner is not a bend: the pieces each side are straight; nor is a straight, nor no track at all
 assert.equal(typical({},polyWay([[0,0],[0,-200],[0,-400],[200,-400],[400,-400]])),null);assert.equal(typical({},polyWay([[0,0],[0,-300],[0,-600]])),null);assert.equal(typical({},{nodes:[],rails:[]}),null);
});

check('the quartiles of the typical radius are the radii a quarter and three quarters of the way up the bend positions in order, whatever the order of the ways',()=>{
 // four ways with a bend each, 52 positions apiece: the 25 degree positions are the tightest quarter, then 15, 10 and 5 degrees
 const ways=[5,25,10,15].map((deg,i)=>kinked(deg,{x0:2000*i,idBase:100*(i+1),wayId:i+1})),data=merge(...ways),typical=safely(()=>F.typicalRadius(data));
 assert.deepEqual([typical.radiusM,typical.quartilesM,typical.bendM,typical.trackM],[q6(RADIUS(10)),[q6(RADIUS(15)),q6(RADIUS(5))],104,4*374.5]);
 assert.deepEqual(F.typicalRadius(merge(...[...ways].reverse())).quartilesM,typical.quartilesM);
 // the lower of the two is lower, the upper higher, and the median between them
 assert.ok(typical.quartilesM[0]<typical.radiusM&&typical.radiusM<typical.quartilesM[1]);
});

check('a position counts for the service of the edge it stands on, not of the edges its window looks across, and one on a node belongs to the edge that begins there',()=>{
 // one chain of 400 m: a main way to the node 200 m along, a siding from it, and a kink of 20 degrees 190.25 m along (9.75 m before the node, so the windows of the last 45 main positions look across it)
 const a=[0,0],k=[0,-190.25],bend=(extra)=>{const b=run(k,20,9.75+extra);return {nodes:[[500,...a],[501,...k],[502,...b],[503,...run(b,20,200-extra)]],rails:[{id:1,nodes:[500,501,502],tunnel:false,service:'main'},{id:2,nodes:[502,503],tunnel:false,service:'siding'}]};};
 const typical=(services,data=bend(0))=>safely(()=>F.typicalRadius(data,{services})),summary=t=>t&&[t.radiusM,t.trackM,t.bendM,t.pieces];
 // positions 13 to 199.5 stand on the main edge (374 of the 749) and 200 to 387 on the siding (375); the kink is in the window of positions 177.5 to 203, 45 of them on the main edge and 7 on the siding
 assert.deepEqual(summary(typical(['main'])),[q6(RADIUS(20)),187,22.5,1]);assert.deepEqual(summary(typical(['siding'])),[q6(RADIUS(20)),187.5,3.5,1]);
 assert.deepEqual(summary(typical(['main','siding'])),[q6(RADIUS(20)),374.5,26,1],'together they are the whole way: 52 positions');
 // a node half a nanometre past a position still begins the next edge for it: the tolerance for the noise in a chain\'s lengths
 assert.deepEqual(summary(typical(['main'],bend(5e-10))),[q6(RADIUS(20)),187,22.5,1]);assert.deepEqual(summary(typical(['siding'],bend(5e-10))),[q6(RADIUS(20)),187.5,3.5,1]);
 // but a node a hundredth of a micrometre past it does not: the position is on the edge it was
 assert.deepEqual(summary(typical(['main'],bend(1e-8))),[q6(RADIUS(20)),187.5,23,1]);
});

check('a position stands on the edge it is in even where the nodes lie closer than a step: the edge is the last whose node is at or behind the position, however many nodes that passes',()=>{
 // one chain of 100 m: a main way of 59.9 m with a node every 0.1 m (five of them to a step of 0.5 m) and a kink of 20 degrees at 30 m, then a siding of one dense edge and one long one.
 // Positions run 13 to 87 every 0.5 m: 13 to 59.5 stand on the main way (94 of the 149) and 60 to 87 on the siding (55). A search that moves one edge on at a step is still in the
 // first edges of the main way's 599 when the way ends, and calls every position main.
 const a=[0,0],points=[a];
 for(let i=1;i<=300;i++)points.push(run(a,0,0.1*i));
 const k=points[300];
 for(let i=1;i<=299;i++)points.push(run(k,20,0.1*i));
 const end=run(k,20,30),far=run(end,20,40);
 const data={nodes:[...points.map((p,i)=>[500+i,...p]),[1100,...end],[2000,...far]],rails:[{id:1,nodes:points.map((p,i)=>500+i),tunnel:false,service:'main'},{id:2,nodes:[1099,1100,2000],tunnel:false,service:'siding'}]};
 const typical=services=>safely(()=>F.typicalRadius(data,{services}));
 assert.deepEqual([typical(['main']).radiusM,typical(['main']).trackM,typical(['main']).pieces],[q6(RADIUS(20)),47,1],'94 positions on the main way, whatever the node spacing');
 assert.equal(typical(['siding']),null,'none of the siding\'s positions has a window across the kink: no bend');
});

check('the typical radius is measured on the curve the page draws, not on the chords between the nodes',()=>{
 const data=arcWay({R:120,spacing:40,count:9}),smooth=safely(()=>F.typicalRadius(data,{shapeOf:shapesOf(data)})),chords=safely(()=>F.typicalRadius(data));
 assert.ok(Math.abs(smooth.radiusM-120)<.05*120,`the drawn curve is the circle: ${smooth.radiusM}`);
 assert.ok(chords.radiusM<.7*smooth.radiusM,`on the chords a node\'s whole turn falls in one baseline: ${chords.radiusM} against ${smooth.radiusM}`);
 assert.ok(smooth.bendM>chords.bendM,'the chords have straight positions between the nodes where the drawn curve bends all along');assert.ok(smooth.bendM>.95*smooth.trackM,`and the drawn curve bends all along but its first and last metres: ${smooth.bendM} of ${smooth.trackM}`);assert.ok(chords.bendM<.75*chords.trackM,'a node is within the 26 m a window looks across for 26 m in every 40');
 assert.ok(smooth.trackM>chords.trackM&&smooth.trackM-chords.trackM<3,'the drawn curve is a little longer than its chords');
});

/**
 * Another way to findTypicalRoute's answer, for a track of one way: the turn across the baseline at every half metre of the drawn curve of the whole way (longhand), the positions whose own
 * radius is within the band of the typical one, for each the mean over the length of the train of |turn / typical turn - 1| summed straight off, the first run of the least mean, and what the
 * train stands on with its middle at the middle of that run: its turn, the tightest bend under it, the length of it that is straight to the eye, and the edges its window touches.
 */
const typicalScan=(data,length,typicalM,{curved=true,baseline=26,margin=10,step=.5,band=.1,bendMin=1}={})=>{
 const {total,headingAt,spans}=drawn(data,curved),need=length/2+margin,typicalTurn=baseline/typicalM,count=Math.round(length/step);
 const turnAt=s=>Math.abs(wrapAngle(headingAt(Math.min(total,s+baseline/2))-headingAt(Math.max(0,s-baseline/2))));
 const found=[];
 for(let s=need;s<=total-need+1e-9;s+=step) {
  const turn=turnAt(s);
  if(!(turn>0&&Math.abs(baseline/turn/typicalM-1)<=band+1e-12))continue;
  let sum=0;for(let i=0;i<=count;i++)sum+=Math.abs(turnAt(s-length/2+i*step)/typicalTurn-1);
  found.push({s,mean:sum/(count+1)});
 }
 if(!found.length)return null;
 const least=Math.min(...found.map(p=>p.mean)),first=found.findIndex(p=>p.mean<=least+1e-12);let last=first;
 while(last+1<found.length&&Math.abs(found[last+1].s-found[last].s-step)<1e-9&&found[last+1].mean<=least+1e-12)last++;
 const apex=(found[first].s+found[last].s)/2,samples=Array.from({length:count+1},(_,i)=>turnAt(apex-length/2+i*step)),lo=Math.max(0,apex-need),hi=Math.min(total,apex+need);
 return {mean:least,apex,turn:turnAt(apex),tightest:Math.min(...samples.filter(t=>t>1e-9).map(t=>baseline/t)),straight:samples.filter(t=>t<bendMin*D2R-1e-12).length*step,spans,covered:spans.filter(e=>e.end>lo&&e.start<hi),run:[found[first].s,found[last].s]};
};
const typicalRoute=(data,length,typicalM,options={})=>safely(()=>F.findTypicalRoute(data,length,{radiusM:typicalM},{shapeOf:options.curved===false?null:shapesOf(data),...options.options}));
check('the bend nearest the typical radius is what a scan written another way finds: the positions in the band, the least mean departure from the typical turn along the train, the middle of its first run, and the edges the window touches',()=>{
 const a=[0,0],b=run(a,0,200.25),c=run(b,20,60),d=run(c,40,199.75),e=run(a,0,100.25),f=run(e,10,200),pair=polyWay([a,b,c,d]),two=polyWay([a,e,f,run(f,30,99.75)]),end=polyWay([a,run(a,0,300.25),run(run(a,0,300.25),20,60)]);
 // a kink drawn smooth is a gentler bend than its chords make it: the typical radius of those is the median of what the page draws
 const drawnMedian=data=>F.typicalRadius(data,{shapeOf:shapesOf(data)}).radiusM,arc100=arcWay({R:100,spacing:20,count:21});
 const cases=[
  ['an arc of 120 m drawn through nodes 40 m apart',arcWay({R:120,spacing:40,count:9}),100,120,true],
  ['an arc of 100 m through nodes 20 m apart, a train of 60 m, a typical radius 10% over',arc100,60,110,true],
  ['the same, 8% under',arc100,60,92,true],
  ['the same, a little further than a tenth from it, and no place is in the band',arc100,60,90,true,false],
  ['a kink of 20 degrees',kinked(20),60,RADIUS(20),false],
  ['two kinks of 20 degrees 60 m apart, a train of 100 m that sees both from either, and the first of two equal places',pair,100,RADIUS(20),false],
  ['the same drawn smooth',pair,100,drawnMedian(pair),true],
  ['kinks of 10 and 20 degrees, the typical radius that of the 20',two,60,RADIUS(20),false],
  ['the same, the typical radius that of the 10',two,60,RADIUS(10),false],
  ['the same, a radius between the two that is in the band of neither',two,60,(RADIUS(10)+RADIUS(20))/2,false,false],
  ['a kink 60 m before the end of its way',end,100,RADIUS(20),false],
  ['the same drawn smooth',end,100,drawnMedian(end),true],
 ];
 for(const [name,data,length,typicalM,curved,has=true] of cases) {
  const want=typicalScan(data,length,typicalM,{curved}),route=typicalRoute(data,length,typicalM,{curved});
  assert.equal(want!==null,has,`${name}: ${has?'a place is':'no place is'} in the band`);
  if(want===null){assert.equal(route,null,`${name}: no route`);continue;}
  assert.notEqual(route,null,`${name}: a route`);
  const start=want.spans.find(s=>s.from===route.steps[0].from).start;
  near(route.turnDeg*D2R,want.turn,1e-7,`${name}: the turn`);near(route.radiusM,26/want.turn,2e-6,`${name}: the radius`);near(start+route.apexS,want.apex,5e-6,`${name}: the middle of the train`);
  assert.deepEqual(route.steps.map(s=>[s.from,s.to]),want.covered.map(s=>[s.from,s.to]),`${name}: the edges of the window`);
  near(route.pick.meanDeviation,want.mean,1e-6,`${name}: the mean departure`);near(route.pick.tightestM,want.tightest,2e-6,`${name}: the tightest bend under the train`);assert.equal(route.pick.straightM,want.straight,`${name}: the straight under it`);
  assert.deepEqual([route.pick.kind,route.pick.typicalRadiusM,route.pick.bandShare],['typical',typicalM,.1],`${name}: the pick says what it was picked for`);
  assert.equal(route.source,'real');assert.equal(route.smooth,curved);assert.equal(route.baselineM,26);
 }
});

check('a kink is what the train stands on at the middle of the run of equal places, its mean departure counts what is straight under it, and of two equal runs the first wins',()=>{
 // one kink of 20 degrees at 200.25 m of 400: 52 places have it in their window, all of them with the whole kink in the 60 m of train, so they tie, and the middle of the run is the kink
 const one=typicalRoute(kinked(20,{lead:200.25}),60,RADIUS(20),{curved:false});
 vec(one.apex,[0,-200.25],1e-6,'the kink');
 assert.deepEqual(one.pick,{kind:'typical',typicalRadiusM:RADIUS(20),bandShare:.1,meanDeviation:q6(69/121),tightestM:q6(RADIUS(20)),straightM:34.5});
 near(one.turnDeg,20,1e-9);near(one.radiusM,q6(RADIUS(20)),1e-9);
 // two kinks 60 m apart (200.25 and 260.25), a train of 100 m: from the last place of the first kink or the first place of the second it sees 84 of 201 places in a kink, the most it can, and the first run wins
 const a=[0,0],b=run(a,0,200.25),c=run(b,20,60),d=run(c,40,199.75),both=polyWay([a,b,c,d]),two=typicalRoute(both,100,RADIUS(20),{curved:false});
 near(two.apexS,213,1e-6,'the last place of the first kink, 12.75 m past it, not the first of the second at 247.5');
 assert.deepEqual(two.pick,{kind:'typical',typicalRadiusM:RADIUS(20),bandShare:.1,meanDeviation:q6(117/201),tightestM:q6(RADIUS(20)),straightM:58.5});
 // written another way, the least mean is that and the run of it one place
 const scanned=typicalScan(both,100,RADIUS(20),{curved:false});near(scanned.mean,117/201,1e-12);assert.deepEqual(scanned.run,[213,213]);
});

check('a place counts if its own radius is within the band of the typical one, the edge itself counted, and a route needs one; a bad length or radius is refused',()=>{
 const way=kinked(20),r=RADIUS(20),route=(typicalM,options)=>typicalRoute(way,60,typicalM,{curved:false,options});
 // the band is a share of the typical radius, on either side: the kink\'s radius is 10% over at r / 1.1, and 10% under at r / 0.9, the edges counted to a million-millionth; a hair beyond is out
 for(const [ratio,note] of [[1.1,'10% over'],[.9,'10% under']]) {
  const edge=r/(ratio+(ratio>1?4e-13:-4e-13)),beyond=r/(ratio+(ratio>1?2e-12:-2e-12));
  assert.ok(Math.abs(r/edge-1)>.1&&Math.abs(r/edge-1)<.1+1e-12,`${note}: the edge is a hair past the share in float`);assert.notEqual(route(edge),null,`${note}: the edge is in the band`);assert.equal(route(beyond),null,`${note}: a hair past it is out`);
 }
 assert.equal(route(r/1.2),null,'20% over');assert.equal(route(r/.8),null,'20% under');assert.notEqual(route(r/1.05),null);assert.notEqual(route(r/.95),null);
 // a wider band takes more, a narrower one less, and the share is reported as given
 assert.equal(route(r/1.15),null);const wide=route(r/1.15,{bandShare:.2});assert.equal(wide.pick.bandShare,.2);assert.equal(route(r/1.05,{bandShare:.04}),null);
 // nothing in the band: a train too long for every piece, a straight track, a typical radius far from the track\'s, no data
 assert.equal(typicalRoute(way,5000,r,{curved:false}),null,'a train longer than every piece');assert.equal(typicalRoute(polyWay([[0,0],[0,-300],[0,-600]]),60,r,{curved:false}),null,'a straight');assert.equal(route(1000),null);assert.equal(F.findTypicalRoute({nodes:[],rails:[]},60,{radiusM:r}),null);
 // a bend near the end of its way: a train that does not fit beside it stands on what it can
 const tail=polyWay([[0,0],run([0,0],0,300.25),run(run([0,0],0,300.25),20,60)]);
 assert.notEqual(typicalRoute(tail,60,r,{curved:false}),null);assert.equal(typicalRoute(tail,100,r,{curved:false}).pick.straightM,74.5,'the 26 places of the kink that a train of 100 m fits beside all see all of it: 149 of 201 places are straight');
 // refused
 assert.throws(()=>F.findTypicalRoute(way,0,{radiusM:r}),/a train 0 m long has no bend to find/);assert.throws(()=>F.findTypicalRoute(way,-5,{radiusM:r}),/a train -5 m long/);assert.throws(()=>F.findTypicalRoute(way,NaN,{radiusM:r}),/a train NaN m long/);
 assert.throws(()=>F.findTypicalRoute(way,60,null),/a typical radius of undefined m is no bend/);assert.throws(()=>F.findTypicalRoute(way,60,{}),/a typical radius of undefined m/);
 assert.throws(()=>F.findTypicalRoute(way,60,{radiusM:0}),/a typical radius of 0 m is no bend/);assert.throws(()=>F.findTypicalRoute(way,60,{radiusM:-3}),/a typical radius of -3 m/);assert.throws(()=>F.findTypicalRoute(way,60,{radiusM:NaN}),/a typical radius of NaN m/);
});

check('the typical route cuts the track at the page\'s corners, as the tightest bend\'s does, and reads a turn across due south as it reads one across due north',()=>{
 // a turn of 29 degrees at a node is smoothed by the page and is a bend of its own radius; 31 degrees is a corner, with no bend either side of it
 const turn=deg=>polyWay([[0,0],run([0,0],0,200),run(run([0,0],0,200),deg,200),run(run(run([0,0],0,200),deg,200),deg,200)]);
 assert.notEqual(typicalRoute(turn(29),60,RADIUS(29),{curved:false}),null,'29 degrees is smoothed');
 assert.equal(typicalRoute(turn(31),60,RADIUS(31),{curved:false}),null,'31 degrees is a corner');
 // a cut of its own moves the line: at 15 degrees a kink of 20 is a corner, at 25 a kink of 20 is a bend
 assert.equal(typicalRoute(turn(20),60,RADIUS(20),{curved:false,options:{cutDeg:15}}),null);assert.notEqual(typicalRoute(turn(20),60,RADIUS(20),{curved:false,options:{cutDeg:25}}),null);
 // the headings of a kink across due south are 170 and -170 degrees as the page counts them (clockwise from north, -180 to 180): the turn is 20 degrees, as it is across due north, and not 340
 const here=typicalRoute(kinked(20),60,RADIUS(20),{curved:false}),b=run([0,0],170,100.25),there=typicalRoute(polyWay([[0,0],b,run(b,190,299.75)]),60,RADIUS(20),{curved:false});
 assert.notEqual(there,null,'a bend across due south is a bend of 20 degrees');near(there.turnDeg,20,1e-6);near(there.radiusM,q6(RADIUS(20)),1e-6);
 near(there.pick.meanDeviation,here.pick.meanDeviation,1e-6);near(there.pick.tightestM,here.pick.tightestM,1e-5);assert.equal(there.pick.straightM,here.pick.straightM);
});

check('a piece holds the train if it is as long as the train and its margin each end, to a nanometre: a hair short does not, a hair over does, and half a metre short never does',()=>{
 // a way of 120 m with a kink of 20 degrees in the middle holds a train of 100 m and 10 m of margin each end with one place, the kink; a second piece that always holds the train gives a route to count against
 const way=extra=>polyWay([[0,0],[0,-60],run([0,-60],20,60+extra)],{idBase:700,wayId:7}),long=kinked(20,{x0:3000,idBase:300,wayId:3});
 for(const [extra,holds] of [[0,true],[5e-10,true],[-5e-10,true],[1e-8,true],[-1e-8,false],[-.5,false],[-1,false],[-1.5,false]]) {
  const route=typicalRoute(merge(way(extra),long),100,RADIUS(20),{curved:false});
  assert.deepEqual([route.searched.pieces,route.searched.fitting],[2,holds?2:1],`a piece ${120+extra} m long ${holds?'holds':'does not hold'} a train of 100 m and its margins of 10 m`);
 }
 // alone, the piece of exactly the length holds the train on its one place, the kink in the middle of it
 const alone=typicalRoute(way(0),100,RADIUS(20),{curved:false});assert.notEqual(alone,null,'exactly long enough');near(alone.apexS,60,1e-6);near(alone.turnDeg,20,1e-6);
 assert.equal(typicalRoute(way(-1e-8),100,RADIUS(20),{curved:false}),null,'a hundredth of a micrometre short');
});

check('the length of the train is counted in steps with a hair of allowance for float: 40.4 m is 404 steps of 0.1 m, so its mean and its straight are over 405 places of it, not 404',()=>{
 // 40.4 / 0.1 is 403.99999999999994 in float; the train has 405 places along it, each 0.1 m, the kink in the middle of 405 of the places a train can stand
 const way=kinked(20,{lead:100.23}),want=typicalScan(way,40.4,RADIUS(20),{curved:false,step:.1}),route=typicalRoute(way,40.4,RADIUS(20),{curved:false,options:{stepM:.1}});
 near(route.pick.meanDeviation,want.mean,1e-6,'the mean over 405 places');near(route.pick.tightestM,want.tightest,2e-6,'the tightest bend under the train');near(route.pick.straightM,want.straight,1e-6,'the straight under it');
 assert.ok(Math.abs(route.pick.straightM/.1-Math.round(route.pick.straightM/.1))<1e-6,'a whole number of steps');
});

check('the track and the bend of the typical radius are given to a micrometre: a step that is no fraction of two leaves no float dust',()=>{
 // 1247 positions of 0.3 m on a way of 400 m, 87 of them in the kink\'s window: 374.1 and 26.1 m, where the sums are 374.10000000000844 and 26.099999999999998
 const typical=safely(()=>F.typicalRadius(kinked(20),{stepM:.3}));
 assert.deepEqual([typical.stepM,typical.trackM,typical.bendM],[.3,374.1,26.1]);
});

check('the last place of a piece counts to a nanometre: a piece 0.3 m longer than the train and its margins holds four places of 0.1 m, however the float falls, and the pick is the middle of the four',()=>{
 // 120.3 m less a hundredth of a nanometre with the kink in the middle: (0.3 - 1e-11) / 0.1 is 2.9999999999 in float, three steps and a hair, so the fourth place needs the allowance. All four tie: the kink is within 0.15 m of each.
 const way=polyWay([[0,0],[0,-60.15],run([0,-60.15],20,60.15-1e-11)]),options={stepM:.1};
 const route=typicalRoute(way,100,RADIUS(20),{curved:false,options}),want=typicalScan(way,100,RADIUS(20),{curved:false,step:.1});
 near(want.apex,60.15,1e-6,'written another way, the middle of four places from 60 m to 60.3 m');near(route.apexS,60.15,1e-6,'the middle of the four, not of three');
 near(route.pick.meanDeviation,want.mean,1e-6);near(route.turnDeg,20,1e-6);
});

check('a straight is outside every band however wide, and a bend however gentle is inside its own: the radius of a straight is infinite, not nothing, and only a turn of a nanoradian or less is a straight',()=>{
 // the radius of a straight is not nothing: with a band of 100% or more, a radius of nothing would be within it of any typical radius
 const straight=polyWay([[0,0],[0,-300],[0,-600]]);
 for(const bandShare of [.5,1,2,10])assert.equal(typicalRoute(straight,60,RADIUS(20),{curved:false,options:{bandShare}}),null,`a straight in a band of ${bandShare}`);
 // a turn of a hundredth of a degree is a bend like any other: a radius of 149 km, within 10% of a typical radius of 149 km
 const gentle=typicalRoute(kinked(.01),60,RADIUS(.01),{curved:false});assert.notEqual(gentle,null,'a hundredth of a degree is a bend');near(gentle.turnDeg,.01,1e-9);near(gentle.radiusM,q6(RADIUS(.01)),1e-6);
});

check('the turn of the pick is the turn at the middle of the run of places that tie, not at its first or its last: a window takes in one kink at each end of the run and both in the middle',()=>{
 // kinks of 20 and 25 degrees 20 m apart, 150.25 and 170.25 m along: a window sees the first alone (20 degrees), then both (45), then the second alone (25). A train of 100 m has all of both
 // in the 92 places from 137.5 m to 183 m, so those tie (a band of 50% of a typical turn of 26 degrees takes all three turns in), and the middle of them, 160.25 m, sees both
 const a=[0,0],b=run(a,0,150.25),c=run(b,20,20),both=polyWay([a,b,c,run(c,45,229.75)]),options={bandShare:.5};
 const route=typicalRoute(both,100,RADIUS(26),{curved:false,options}),want=typicalScan(both,100,RADIUS(26),{curved:false,band:.5});
 near(want.apex,160.25,1e-9,'written another way, the middle of the run');near(want.turn,45*D2R,1e-9,'and the window there takes in both kinks');
 near(route.apexS,160.25,1e-6);near(route.turnDeg,45,1e-6,'the turn at the middle, 45 degrees, not 20 at the first place or 25 at the last');near(route.radiusM,q6(RADIUS(45)),1e-5);
 near(route.pick.meanDeviation,want.mean,1e-6);near(route.pick.tightestM,want.tightest,2e-6);assert.equal(route.pick.straightM,want.straight);
});

check('a place under the train is straight to the eye below the threshold and a bend at it, to a part in a million-million: a kink of exactly the threshold is no straight, whatever the float makes of it',()=>{
 // a kink of D degrees under a threshold of D: the 52 places of the kink are bends (the turn is the threshold, to the float) and the other 69 of the 121 are straight. A turn a float short of the
 // threshold is the threshold still; across 29 kinks several are a float short (and none is a million-millionth over it, so the allowance is not a licence to count a bend as a straight)
 for(let deg=1;deg<=29;deg++) {
  const route=typicalRoute(kinked(deg),60,RADIUS(deg),{curved:false,options:{bendMinDeg:deg}});
  assert.equal(route.pick.straightM,34.5,`${deg} degrees against a threshold of ${deg}: 69 straight places of the 121`);
 }
});

check('of two bends in the band the one the train sees more of wins wherever it is in the file, and of two equal ones the one walked first',()=>{
 // one kink of 20 degrees on way 3, two of 20 degrees 30 m apart (a train of 60 m sees both from between) on way 2, a lone kink on way 1: way 2 is the nearest to a bend all along the train
 const lone=kinked(20,{idBase:100,wayId:1}),a=[3000,0],b=run(a,0,100.25),c=run(b,20,30),pair=polyWay([a,b,c,run(c,40,269.75)],{idBase:200,wayId:2}),late=kinked(20,{x0:6000,idBase:300,wayId:3});
 const data=merge(lone,pair,late),route=typicalRoute(data,60,RADIUS(20),{curved:false});
 assert.deepEqual(route.ways,[2],'the pair, which the train stands across more of');assert.ok(route.pick.meanDeviation<q6(69/121));
 assert.deepEqual(route.searched,{chains:3,pieces:3,fitting:3});
 const flipped={nodes:[...data.nodes].reverse(),rails:[...data.rails].reverse()};assert.deepEqual(typicalRoute(flipped,60,RADIUS(20),{curved:false}),route,'the order of the file changes nothing');
 // equal bends: the first chain walked, the one from the lowest node, whatever order the file lists them in
 const twin=merge(kinked(20,{idBase:100,wayId:5}),kinked(20,{x0:3000,idBase:300,wayId:3})),first=typicalRoute(twin,60,RADIUS(20),{curved:false});
 assert.deepEqual(first.ways,[5],'equal bends: the chain that starts at the lowest node');assert.deepEqual(typicalRoute({nodes:[...twin.nodes].reverse(),rails:[...twin.rails].reverse()},60,RADIUS(20),{curved:false}).ways,[5]);
 // a bend a hair nearer wins, in another chain: kinks of 20 and 20.0001 degrees, the typical radius that of the second
 const nearer=merge(kinked(20,{idBase:100,wayId:1}),kinked(20.0001,{x0:3000,idBase:300,wayId:2}));
 assert.deepEqual(typicalRoute(nearer,60,RADIUS(20.0001),{curved:false}).ways,[2],'the later chain, a hair nearer');assert.deepEqual(typicalRoute(nearer,60,RADIUS(20),{curved:false}).ways,[1]);
});

check('the route for a typical radius is the bend nearest it on the page\'s track with the frame of the train on it, and the arc of that radius, saying why, where no stretch has a bend in the band',()=>{
 const data=arcWay({R:150,spacing:30,count:41}),shapeOf=shapesOf(data),typical=safely(()=>F.typicalRadius(data,{shapeOf})),route=safely(()=>F.curveRouteFor(data,100,{shapeOf,typical}));
 assert.equal(route.source,'real');assert.equal(route.smooth,true);assert.equal(route.pick.kind,'typical');assert.equal(route.pick.typicalRadiusM,typical.radiusM);
 assert.ok(route.local&&route.local.points.length===route.points.length&&route.local.insideSign===-route.local.outsideSign,'the frame of the train on it, as for any route');
 assert.deepEqual({...route,local:null},{...safely(()=>F.findTypicalRoute(data,100,typical,{shapeOf})),local:null},'the route findTypicalRoute gives');
 // without a typical radius the route is the tightest bend\'s, and has no pick
 const tight=safely(()=>F.curveRouteFor(data,100,{shapeOf}));assert.equal(tight.pick,undefined);assert.deepEqual({...tight,local:null},{...F.findCurveRoute(data,100,{shapeOf}),local:null});
 // the band and the margin are the search\'s, passed on
 assert.equal(F.curveRouteFor(data,100,{shapeOf,typical,bandShare:.2}).pick.bandShare,.2);
 // no stretch holds the train on a bend in the band: the arc of the typical radius, its note saying which band
 const none=safely(()=>F.curveRouteFor(data,100,{shapeOf,typical:{radiusM:600}}));
 assert.equal(none.source,'synthetic');near(none.radiusM,600,1e-9);assert.equal(none.pick,undefined);assert.ok(none.local);
 assert.equal(none.note,'a synthetic circular arc of radius 600 m: no run of the page\'s track holds a train 100 m long on a bend within 10% of the typical radius');
 assert.match(F.curveRouteFor(data,100,{shapeOf,typical:{radiusM:600},bandShare:.25}).note,/ on a bend within 25% of the typical radius$/);
 // the share is said to a micrometre of a per cent: .07 * 100 is 7.000000000000001 in float, and the note says 7
 assert.match(F.curveRouteFor(data,100,{shapeOf,typical:{radiusM:600},bandShare:.07}).note,/ on a bend within 7% of the typical radius$/);
 // the arc of a track with no bend at all is of the typical radius too, not of the fallback\'s, and the tightest bend\'s fallback is as it was
 const arc=F.curveRouteFor({nodes:[],rails:[]},130,{typical:{radiusM:452}});near(arc.radiusM,452,1e-9);assert.match(arc.note,/^a synthetic circular arc of radius 452 m: .* 130 m long on a bend within 10% of the typical radius$/);
 // the typical radius comes before a fallback radius the caller names: the fallback is for the tightest bend\'s arc, which has no typical radius
 near(F.curveRouteFor({nodes:[],rails:[]},130,{typical:{radiusM:452},fallbackRadiusM:200}).radiusM,452,1e-9);near(F.curveRouteFor({nodes:[],rails:[]},130,{fallbackRadiusM:200}).radiusM,200,1e-9);
 const old=F.curveRouteFor({nodes:[],rails:[]},130);near(old.radiusM,100,1e-9);assert.match(old.note,/ 130 m long on a bend$/,'the tightest bend\'s arc says what it said');
 // a note ends with the reason the caller gave
 assert.match(F.circularArcRoute(130,100,{reason:'on a hill'}).note,/ 130 m long on a hill$/);
});

// ---- the frame ----------------------------------------------------------------------------------------------------------------------------------
const rigid=(p,theta,t)=>[p[0]*Math.cos(theta)+p[1]*Math.sin(theta)+t[0],-p[0]*Math.sin(theta)+p[1]*Math.cos(theta)+t[1]];
check('the frame puts the tightest point at the origin with the travel along -z, whatever the route\'s place and heading in the world, and says which side is the outside',()=>{
 const base=find(arcWay({R:100,spacing:40,count:9}),60),frame=F.frameTransform(base);
 vec(frame.point(base.apex),[0,0],2e-6,'the apex');
 const travel=[frame.p1[0]-frame.p0[0],frame.p1[1]-frame.p0[1]],n=Math.hypot(...travel);vec(frame.vector([travel[0]/n,travel[1]/n]),[0,-1],1e-12,'the chord across the baseline runs along -z');
 near(frame.point([frame.apex[0]+3,frame.apex[1]])[0]**2+frame.point([frame.apex[0]+3,frame.apex[1]])[1]**2,9,1e-9,'lengths are kept');
 const local=F.curveFrame(base);
 for(const p of local.points)for(const v of p)assert.equal(v,Math.round(v*1e6)/1e6,'the points are given to a micrometre');
 assert.equal(local.points.length,base.points.length);vec(local.apex,base.apex,1e-5);near(local.lengthM,base.lengthM,2e-5);assert.equal(local.apexS,base.apexS);
 // a bend to the right: the centre of the bend is to the right, so +x is the inside
 const arc=safely(()=>F.circularArcRoute(130,100)),right=F.curveFrame(arc);
 assert.equal(right.insideSign,1);assert.equal(right.outsideSign,-1);near(right.headingDeg,0,.2,'the arc travels north');
 for(const p of right.points)assert.ok(Math.hypot(p[0]-100*right.insideSign*1,p[1])<=100+1e-3,'inside the circle of the bend\'s centre on the inside');
 // the same route moved and turned anywhere in the world has the same local points
 for(const [theta,t] of [[1.234,[500,-300]],[-2.5,[-1200,40]],[0,[0,0]]]) {
  const moved={...arc,points:arc.points.map(p=>rigid(p,theta,t).map(v=>Math.round(v*1e6)/1e6)),apex:rigid(arc.apex,theta,t)};
  const there=F.curveFrame(moved);there.points.forEach((p,i)=>vec(p,right.points[i],5e-6,`point ${i} after turning by ${theta}`));assert.equal(there.insideSign,right.insideSign);
  near(Math.abs(Math.sin((there.headingDeg-right.headingDeg-theta/-D2R)*D2R/2)),0,1e-4,'the heading turns with the route');
 }
 // a route that does not bend has no inside to speak of: the right-hand side is taken for it
 const straight=F.curveFrame({points:[[0,0],[0,-50],[0,-100]],apexS:50,baselineM:26});assert.deepEqual([straight.insideSign,straight.outsideSign],[1,-1]);
 // and the mirror image bends the other way
 const mirrored=F.curveFrame({...arc,points:arc.points.map(p=>[-p[0],p[1]]),apex:[0,0]});assert.equal(mirrored.insideSign,-1);assert.equal(mirrored.outsideSign,1);
 mirrored.points.forEach((p,i)=>vec(p,[-right.points[i][0],right.points[i][1]],5e-6));
 assert.throws(()=>F.frameTransform({points:[[0,0],[0,0]],apexS:0,baselineM:26}),/no direction at its tightest point/);
});

check('carPoint is where the page puts a point of the car node, and localPose is that same placement in the frame of the route',()=>{
 const pose={position:[12.5,-40.25],rotationY:.7,scaleZ:1.013};
 const node=new T.Group();node.position.set(pose.position[0],0,pose.position[1]);node.rotation.y=pose.rotationY;node.scale.set(1,1,pose.scaleZ);node.updateMatrixWorld(true);
 for(const [x,z] of [[0,0],[1.2,0],[-1.45,25.2],[2,-3],[0,13]]){const w=node.localToWorld(new T.Vector3(x,0,z));vec(F.carPoint(pose,x,z),[w.x,w.z],1e-12,`(${x}, ${z})`);}
 const frame=F.frameTransform(find(arcWay({R:100,spacing:40,count:9}),60));
 const world={car:{index:3},position:[-170.3,22.2],rotationY:2.1,scaleZ:1.004,frontBogie:{point:[-171,23],back:[Math.sin(2.1),Math.cos(2.1)]},rearBogie:{point:[-169.5,21.4],back:[Math.sin(2.2),Math.cos(2.2)]}};
 const local=safely(()=>F.localPose(world,frame));
 assert.equal(local.car,world.car);assert.equal(local.scaleZ,world.scaleZ);
 for(const [x,z] of [[0,0],[1.2,0],[-1.45,25.2],[2,-3]])vec(F.carPoint(local,x,z),frame.point(F.carPoint(world,x,z)),1e-12,`the car's own (${x}, ${z}) lands where the frame puts it`);
 vec(local.frontBogie.point,frame.point(world.frontBogie.point),1e-12);vec(local.rearBogie.point,frame.point(world.rearBogie.point),1e-12);
 vec(local.frontBogie.back,frame.vector(world.frontBogie.back),1e-12,'a direction is turned, not moved');vec(local.rearBogie.back,frame.vector(world.rearBogie.back),1e-12);
 near(Math.hypot(...local.frontBogie.back),1,1e-12);
 // a car that was pointing along the travel at the apex is pointing along -z, which is a half turn of the car (its own +z is the tail)
 const ahead={car:{},position:frame.apex,rotationY:Math.atan2(frame.p1[0]-frame.p0[0],frame.p1[1]-frame.p0[1]),scaleZ:1,frontBogie:{point:frame.apex,back:[0,1]},rearBogie:{point:frame.apex,back:[0,1]}};
 const turned=F.localPose(ahead,frame);near(Math.abs(turned.rotationY),Math.PI,1e-9,'the travel is -z, which is a half turn of a car that faces +z');vec(turned.position,[0,0],1e-9);
});

// ---- joints ------------------------------------------------------------------------------------------------------------------------------------
const spec=family=>({half:bodySpec(family).half,gangwayWidthM:bodySpec(family).gangway.width,endGapM:END_GAP});
const straightPoses=f=>f.cars.map(c=>({index:c.index,start:c.start,end:c.end,position:[0,0],rotationY:0,scaleZ:1}));
/** The poses of a kind on a synthetic arc of radius R by the page's carPoses, in the frame of the route. */
const arcPlaced=(kind,R=100)=>{
 const f=formations.get(kind),route=F.curveRouteFor({nodes:[],rails:[]},f.length+20,{fallbackRadiusM:R}),curve={route,placement:C.placementRoute(route)};
 return {f,route,curve,placed:safely(()=>C.curvePoses(f,curve))};
};
check('the gap between two convex shapes is their distance apart, nothing when they touch and minus the way out when they overlap',()=>{
 const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
 near(F.polygonGap(rect(0,0,1,1),rect(3,0,4,1)),2,1e-12,'side by side');near(F.polygonGap(rect(3,0,4,1),rect(0,0,1,1)),2,1e-12,'and the other way');
 near(F.polygonGap(rect(0,0,1,1),rect(4,5,5,6)),5,1e-12,'diagonal: corner to corner, 3-4-5');
 near(F.polygonGap(rect(0,0,1,1),rect(1,0,2,1)),0,1e-12,'touching');
 near(F.polygonGap(rect(0,0,2,2),rect(1.5,0,3,2)),-.5,1e-12,'overlapping by half a metre');near(F.polygonGap(rect(0,0,2,2),rect(.5,.5,1.5,1.5)),-1.5,1e-12,'one inside the other: the shortest push that clears it, the inner one\'s near side (0.5) to the outer one\'s far side (2)');
 // turned and moved: the same gap
 const spin=(poly,theta,t)=>poly.map(p=>rigid(p,theta,t));
 for(const [theta,t] of [[.4,[10,3]],[2.9,[-5,7]]])near(F.polygonGap(spin(rect(0,0,1,1),theta,t),spin(rect(4,5,5,6),theta,t)),5,1e-9);
 // a square turned 45 degrees: its corner points at the other square
 const diamond=[[0,-Math.SQRT2],[Math.SQRT2,0],[0,Math.SQRT2],[-Math.SQRT2,0]].map(p=>[p[0]+4,p[1]]);near(F.polygonGap(rect(-1,-1,1,1),diamond),4-Math.SQRT2-1,1e-12,'corner of a diamond to the side of a square');
 // and against another way to the same number, for convex shapes of three to seven sides turned and moved at random: the signed distance from the origin to the Minkowski difference of
 // the two (the hull of every corner of the first less every corner of the second), negative when the origin is inside it
 const random=(seed=>()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;})(20260101);
 const convex=()=>{const n=3+Math.floor(random()*5),rx=.5+random()*2.5,rz=.5+random()*2.5,turn=random()*2*Math.PI,at=[random()*5-2.5,random()*5-2.5];return Array.from({length:n},()=>random()*2*Math.PI).sort((p,q)=>p-q).map(t=>rigid([rx*Math.cos(t),rz*Math.sin(t)],turn,at));};
 const cross=(o,p,q)=>(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);
 const chain=sorted=>{const h=[];for(const p of sorted){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}h.pop();return h;};
 const signedDistance=(a,b)=>{
  const sorted=a.flatMap(p=>b.map(q=>[p[0]-q[0],p[1]-q[1]])).sort((p,q)=>p[0]-q[0]||p[1]-q[1]),hull=[...chain(sorted),...chain([...sorted].reverse())];
  let nearest=Infinity,inside=true;
  hull.forEach((p,i)=>{const q=hull[(i+1)%hull.length],dx=q[0]-p[0],dz=q[1]-p[1],t=Math.max(0,Math.min(1,-(p[0]*dx+p[1]*dz)/(dx*dx+dz*dz)));nearest=Math.min(nearest,Math.hypot(p[0]+t*dx,p[1]+t*dz));if(cross(p,q,[0,0])<0)inside=false;});
  return inside?-nearest:nearest;
 };
 let apart=0,overlapping=0;
 for(let i=0;i<400;i++){
  const a=convex(),b=convex(),want=signedDistance(a,b);
  near(safely(()=>F.polygonGap(a,b)),want,1e-9,`pair ${i}`);near(F.polygonGap(b,a),want,1e-9,`pair ${i} the other way round`);
  if(want>0)apart++;else overlapping++;
 }
 assert.ok(apart>=100&&overlapping>=100,`both kinds of pair are tried: ${apart} apart, ${overlapping} overlapping`);
});

check('on a straight every joint is two bellows long and does not slip; on a bend it opens on the outside, closes on the inside and slips across',()=>{
 for(const kind of ['gn387x4','lner5']) {
  const f=formations.get(kind),joints=safely(()=>F.curveJoints(straightPoses(f),spec(f.family),{outsideSign:1}));
  assert.equal(joints.length,f.cars.length-1);
  joints.forEach((j,i)=>{
   assert.deepEqual([j.joint,j.between],[i,[f.cars[i].index,f.cars[i+1].index]]);near(j.turnDeg,0,1e-12);near(j.bodyGapM,2*END_GAP,1e-12,'the bodies stand 2 x END_GAP apart on a straight');
   for(const s of [j.coupler,j.gangway.left,j.gangway.right]){near(s.distanceM,0,1e-12);near(s.openM,0,1e-12);near(s.slipM,0,1e-12);}
   assert.deepEqual([j.coupler.name,j.coupler.side,j.coupler.xM],['coupler','centre',0]);
   const w=bodySpec(f.family).gangway.width;assert.deepEqual([j.gangway.left.name,j.gangway.left.xM,j.gangway.right.name,j.gangway.right.xM],['left',-w/2,'right',w/2]);
  });
  assert.deepEqual(joints.map(j=>[j.gangway.left.side,j.gangway.right.side]),joints.map(()=>['inside','outside']),'outsideSign +1: the right-hand edge is the outside');
  assert.deepEqual(F.curveJoints(straightPoses(f),spec(f.family),{outsideSign:-1}).map(j=>[j.gangway.left.side,j.gangway.right.side]),joints.map(()=>['outside','inside']));
  assert.deepEqual(F.curveJoints(straightPoses(f),spec(f.family)).map(j=>j.gangway.right.side),joints.map(()=>'outside'),'the outside is on the right unless said');
 }
 // on the arc (the centre of the bend on the +x side, so the outside is -x): the outside opens and the inside closes
 const {f,route,placed}=arcPlaced('gn387x4',100),joints=F.curveJoints(placed.poses,spec(f.family),{outsideSign:route.local.outsideSign});
 assert.equal(route.local.outsideSign,-1);
 joints.forEach((j,i)=>{
  const outside=j.gangway.left,inside=j.gangway.right;assert.deepEqual([outside.side,inside.side],['outside','inside']);
  assert.ok(outside.openM>0&&inside.openM<0,`the outside opens (${outside.openM}) and the inside closes (${inside.openM})`);
  near(j.coupler.openM,(outside.openM+inside.openM)/2,1e-9,'the coupler is between the edges');
  // two neighbours on a circle of 100 m: their middles are (the lengths of the two cars) / 2 apart, and the turn between them is that arc over the radius
  const apart=(f.cars[i].length+f.cars[i+1].length)/2/100/D2R;
  assert.ok(Math.abs(j.turnDeg-apart)<.05*apart,`a car turns ${j.turnDeg} degrees on the next on a 100 m bend, and the arc between their middles says ${apart}`);
  assert.ok(Math.abs(j.coupler.slipM)<.02&&Math.abs(outside.slipM)<.02,'neighbours of one length are mirror images across the joint: the seam opens along it and hardly slips');
  assert.ok(j.bodyGapM>0&&j.bodyGapM<2*END_GAP+.05);
  for(const s of [j.coupler,outside,inside])near(s.distanceM,Math.hypot(s.openM,s.slipM),1e-9,'distance, open and slip are one vector');
 });
 // a neighbour put to one side and a little further on: the seam is that far apart, opened by the part along the joint and slipped by the part across it
 {
  const family=formations.get('gn387x4').family,w=bodySpec(family).gangway.width;
  const skewed=[{index:0,start:0,end:20,position:[0,0],rotationY:0,scaleZ:1},{index:1,start:20,end:40,position:[.2,.1],rotationY:0,scaleZ:1}],j=F.curveJoints(skewed,spec(family))[0];
  for(const s of [j.coupler,j.gangway.left,j.gangway.right]){near(s.distanceM,Math.hypot(.2,.1),1e-12);near(s.openM,.1,1e-12);near(s.slipM,-.2,1e-12,'positive to the left of the travel');}
  near(j.bodyGapM,2*END_GAP+.1,1e-12,'the bodies are 0.1 m further apart for it');
  // the second car turned by 0.1 radian about the middle of the seam: the coupler stays shut, and the edges open and close by the chord of that turn at half the opening either side, with no slip
  const turned=F.curveJoints([skewed[0],{...skewed[1],position:[-20*Math.sin(.1),20-20*Math.cos(.1)],rotationY:.1}],spec(family))[0];
  near(turned.turnDeg,.1/D2R,1e-12);near(turned.coupler.distanceM,0,1e-12);
  const other=F.curveJoints([skewed[0],{...skewed[1],rotationY:-.1}],spec(family))[0];near(other.turnDeg,.1/D2R,1e-12,'a turn is a size: the other way is the same');
  const across=F.curveJoints([{...skewed[0],rotationY:3.1},{...skewed[1],rotationY:-3.1}],spec(family))[0];near(across.turnDeg,(2*Math.PI-6.2)/D2R,1e-9,'the short way round, across the half turn');
  near(turned.gangway.left.openM,w*Math.sin(.05),1e-12,'the left edge is on the side the seam opens toward (it turned away from it)');near(turned.gangway.right.openM,-w*Math.sin(.05),1e-12);
  for(const s of [turned.gangway.left,turned.gangway.right]){near(s.slipM,0,1e-12);near(s.distanceM,w*Math.sin(.05),1e-12);}
 }
 // the same arc turned and moved about the world gives the same joints: the numbers are of the cars, not of where they stand
 const moved=placed.poses.map(p=>{const q=rigid(p.position,.9,[40,-70]);return {...p,position:q,rotationY:p.rotationY+.9};});
 const again=F.curveJoints(moved,spec(f.family),{outsideSign:route.local.outsideSign});again.forEach((j,i)=>{near(j.bodyGapM,joints[i].bodyGapM,1e-9);near(j.coupler.distanceM,joints[i].coupler.distanceM,1e-9);near(j.turnDeg,joints[i].turnDeg,1e-9);});
});

check('the verdict of the joints: every body gap above nothing, every seam within the reach, each failure a finding with its numbers and a sentence',()=>{
 const seam=(distanceM,extra={})=>({name:'x',side:'outside',xM:0,distanceM,openM:distanceM,slipM:0,...extra});
 const joint=(i,{gap=.5,coupler=.1,left=.1,right=.1}={})=>({joint:i,between:[i,i+1],turnDeg:1,bodyGapM:gap,coupler:seam(coupler,{name:'coupler',side:'centre'}),gangway:{left:seam(left,{name:'left',side:'inside'}),right:seam(right,{name:'right',side:'outside'})}});
 const ok=safely(()=>F.judgeCurveJoints([joint(0),joint(1,{gap:.4,coupler:.35,left:.35,right:.2})],{reachM:.35}));
 assert.deepEqual(ok.findings,[]);assert.deepEqual(ok.bodies,{ok:true,joints:2,minGapM:.4,atJoint:1});assert.deepEqual(ok.couplers,{ok:true,reachM:.35,maxDistanceM:.35,atJoint:1},'exactly the reach is within it');
 assert.deepEqual(ok.gangways,{ok:true,reachM:.35,maxDistanceM:.35,atJoint:1,edge:'left'});
 const slipped=joint(2,{coupler:.36});Object.assign(slipped.coupler,{openM:.3,slipM:-.2});
 const bad=F.judgeCurveJoints([joint(0,{gap:-.02}),joint(1,{gap:0}),slipped,joint(3,{left:.5}),joint(4,{right:.7,left:.6})],{reachM:.35});
 assert.deepEqual(bad.findings.map(x=>[x.check,x.joint,x.edge??null]),[['body-gap',0,null],['body-gap',1,null],['coupler',2,null],['gangway',3,'left'],['gangway',4,'left'],['gangway',4,'right']]);
 assert.equal(bad.findings[0].message,'the bodies of cars 0 and 1 intersect by 0.020 m at the joint');assert.equal(bad.findings[1].message,'the bodies of cars 1 and 2 touch at the joint');
 assert.match(bad.findings[2].message,/^the coupler between cars 2 and 3: the cars' boundary points are 0\.360 m apart \(0\.300 m open, 0\.200 m slipped\), more than the 0\.35 m one bellows reaches$/);
 assert.match(bad.findings[3].message,/^the left \(inside\) edge of the gangway between cars 3 and 4: .* 0\.500 m apart/);assert.match(bad.findings[5].message,/^the right \(outside\) edge of the gangway between cars 4 and 5: .* 0\.700 m apart/);
 assert.deepEqual([bad.findings[2].reachM,bad.findings[2].distanceM,bad.findings[2].side,bad.findings[3].side],[.35,.36,'centre','inside']);
 assert.deepEqual([bad.findings[2].openM,bad.findings[2].slipM,bad.findings[3].openM,bad.findings[3].slipM],[.3,-.2,.5,0],'a finding keeps the opening and the slip of its seam, signed');
 assert.deepEqual([bad.findings[0].gapM,bad.findings[1].gapM,bad.findings[0].between,bad.findings[1].between],[-.02,0,[0,1],[1,2]],'and a finding of the bodies its gap');
 assert.deepEqual(bad.bodies,{ok:false,joints:5,minGapM:-.02,atJoint:0});assert.deepEqual(bad.couplers,{ok:false,reachM:.35,maxDistanceM:.36,atJoint:2});assert.deepEqual(bad.gangways,{ok:false,reachM:.35,maxDistanceM:.7,atJoint:4,edge:'right'});
 // equal numbers name the first joint
 const tie=F.judgeCurveJoints([joint(0,{gap:.3,coupler:.2,left:.2,right:.1}),joint(1,{gap:.3,coupler:.2,left:.2,right:.1})],{reachM:.35});
 assert.deepEqual([tie.bodies.atJoint,tie.couplers.atJoint,tie.gangways.atJoint,tie.gangways.edge],[0,0,0,'left']);
 // one failure alone fails its verdict, among joints that are fine or on its own
 for(const [name,joints,verdict] of [['two bodies that touch',[joint(0,{gap:0})],'bodies'],['a touch among bodies that are apart',[joint(0,{gap:.1}),joint(1,{gap:0})],'bodies'],['a coupler too far among others that are not',[joint(0,{coupler:.5}),joint(1)],'couplers'],
  ['a left edge too far',[joint(0,{left:.5})],'gangways'],['a right edge too far',[joint(0,{right:.5})],'gangways'],['a left edge too far among others that are not',[joint(0),joint(1,{left:.5})],'gangways']])
  assert.equal(F.judgeCurveJoints(joints,{reachM:.35})[verdict].ok,false,name);
 // a number that is not a number is not within anything
 const nan=F.judgeCurveJoints([joint(0,{coupler:NaN}),joint(1,{gap:NaN})],{reachM:.35});assert.deepEqual(nan.findings.map(x=>x.check),['coupler','body-gap']);assert.equal(nan.bodies.ok,false);assert.equal(nan.couplers.ok,false);
 // a train of one car has no joint to judge
 const none=F.judgeCurveJoints([],{reachM:.35});assert.deepEqual(none.findings,[]);assert.deepEqual(none.bodies,{ok:true,joints:0,minGapM:null,atJoint:null});assert.equal(none.couplers.maxDistanceM,null);assert.equal(none.gangways.edge,null);
});

// ---- the cameras --------------------------------------------------------------------------------------------------------------------------------
check('the camera distance is the smallest, to a millimetre, at which every point is inside the fit fraction of the image on both axes and in front of the camera',()=>{
 const base={target:[0,0,0],direction:[0,0,1],up:[0,1,0],fov:50,aspect:1.6,fraction:.84},tanHalf=Math.tan(25*D2R),ceil3=x=>Math.ceil(x*1000-1e-9)/1000;
 near(F.fitCameraDistance({...base,points:[[10,0,0]]}),ceil3(10/(.84*1.6*tanHalf)),.0011,'across the image: the width, with its aspect');
 near(F.fitCameraDistance({...base,points:[[0,10,0]]}),ceil3(10/(.84*tanHalf)),.0011,'up the image: the height');
 near(F.fitCameraDistance({...base,points:[[10,10,0],[1,1,0]]}),ceil3(10/(.84*tanHalf)),.0011,'the worse of the two');
 near(F.fitCameraDistance({...base,points:[[0,0,50]]}),50,.0011,'a point on the camera\'s side of the target needs the camera to back off past it');
 assert.ok(F.fitCameraDistance({...base,points:[[0,0,50],[10,0,0]]})>=50,'and then the others\' width');assert.ok(F.fitCameraDistance({...base,points:[[0,0,50],[10,0,-50]]})>=50);
 near(F.fitCameraDistance({...base,points:[[1,0,50]]}),50+1/(.84*1.6*tanHalf),.0011,'a point off the sight line needs the camera past it by enough depth to bring it inside the width');
 near(F.fitCameraDistance({...base,points:[[10,0,-3]]}),ceil3(10/(.84*1.6*tanHalf))-3,.0011,'a point behind the target is deeper in the view, so the camera can stand nearer: the depth counts');
 near(F.fitCameraDistance({...base,points:[[10,0,-30]]}),0,.0011,'and one so deep that it fits from the target itself needs no distance');
 near(F.fitCameraDistance({...base,fraction:.5,points:[[10,0,0]]}),ceil3(10/(.5*1.6*tanHalf)),.0011,'the fraction is a parameter');near(F.fitCameraDistance({...base,fov:30,points:[[0,10,0]]}),ceil3(10/(.84*Math.tan(15*D2R))),.0011,'so is the field of view');
 near(F.fitCameraDistance({...base,aspect:1,points:[[10,0,0]]}),ceil3(10/(.84*tanHalf)),.0011,'and the aspect');
 // the distance is a whole number of millimetres, rounded up
 const d=F.fitCameraDistance({...base,points:[[7.123,0,0]]});near(d*1000,Math.round(d*1000),1e-6);
 // the default fraction and aspect are the catalogue\'s
 near(F.fitCameraDistance({target:[0,0,0],direction:[0,0,1],up:[0,1,0],fov:50,points:[[10,0,0]]}),ceil3(10/(F.CATALOGUE.fitFraction*F.CATALOGUE.aspect*tanHalf)),.0011);
 // a camera looking along an oblique direction: the points are projected through the real camera
 const direction=[Math.cos(35*D2R),Math.sin(35*D2R),0],points=[[3,0,-20],[-4,2,25],[2,5,0]],dist=F.fitCameraDistance({...base,target:[1,1,1],direction,points});
 const cam=new T.PerspectiveCamera(50,1.6,.1,1e4);cam.position.set(1+direction[0]*dist,1+direction[1]*dist,1+direction[2]*dist);cam.up.set(0,1,0);cam.lookAt(1,1,1);cam.updateMatrixWorld(true);cam.updateProjectionMatrix();
 const worst=Math.max(...points.map(p=>{const v=new T.Vector3(...p).project(cam);return Math.max(Math.abs(v.x),Math.abs(v.y));}));near(worst,.84,.003,'the worst point lands on the fit fraction');assert.ok(worst<=.84+1e-9);
 // a set of points no camera can frame is refused; one as far as 8000 km is found (the search doubles from a metre up to 8388608 m)
 assert.throws(()=>F.fitCameraDistance({...base,points:[[1e9,0,0]]}),/no distance frames the points/);
 near(F.fitCameraDistance({...base,points:[[5.139e6,0,0]]}),5.139e6/(.84*1.6*tanHalf),.01,'as far as the search goes');
});

check('the plan is straight down with the train\'s right-hand side up the image and the oblique is 35 degrees up from the outside of the bend, each framing every car at the fit fraction',()=>{
 const {f,route,curve,placed}=arcPlaced('gn387x4',100),plan=safely(()=>C.planCurveFor(f,curve));
 assert.equal(plan.status,'OK');assert.equal(plan.views.length,2);assert.deepEqual(plan.views.map(v=>v.suffix),F.CURVE_VIEWS);
 const [top,side]=plan.views,outside=route.local.outsideSign;
 for(const v of plan.views){assert.equal(v.id,'C01');assert.equal(v.frame,'curve');assert.equal(v.status,'OK');assert.equal(v.fov,50);assert.deepEqual(v.extents,{scope:'train',z0:0,z1:f.length});assert.equal(v.notes.stage,F.CURVE_STAGE);assert.equal(v.notes.fitFraction,F.CATALOGUE.fitFraction);}
 // straight down at the middle of the footprint, the roof level of the train in the middle of the picture, the right-hand side of the travel up the image
 assert.equal(top.eye[0],top.target[0]);assert.equal(top.eye[2],top.target[2]);assert.ok(top.eye[1]>top.target[1]);assert.equal(top.target[1],f.roofTop);assert.deepEqual(top.up,[1,0,0]);
 // from the outside of the bend, 35 degrees above the horizon, at half the height of the roof, straight across the train
 assert.equal(side.eye[2],side.target[2]);assert.equal(Math.sign(side.eye[0]-side.target[0]),outside);assert.equal(side.target[1],f.roofTop/2);assert.deepEqual(side.up,[0,1,0]);
 near(Math.atan2(side.eye[1]-side.target[1],Math.abs(side.eye[0]-side.target[0]))/D2R,35,1e-4,'the elevation');
 near(Math.hypot(side.eye[0]-side.target[0],side.eye[1]-side.target[1]),side.notes.distanceM,2e-6);near(top.eye[1]-top.target[1],top.notes.distanceM,2e-6);
 assert.equal(side.notes.elevationDeg,35);assert.match(side.notes.side,/^the outside of the bend \((right|left)-hand side of the direction of travel\)$/);assert.match(side.notes.side,outside>0?/right/:/left/);assert.equal(top.notes.imageAxis,'image x runs along the train toward the tail, the nose at the left; image up is the right-hand side of the direction of travel');
 {const cam=new T.PerspectiveCamera(top.fov,F.CATALOGUE.aspect,.01,1e5);cam.position.set(...top.eye);cam.up.set(...top.up);cam.lookAt(...top.target);cam.updateMatrixWorld(true);cam.updateProjectionMatrix();
  const at=(pose,z)=>{const c=F.carPoint(pose,0,z);return new T.Vector3(c[0],0,c[1]).project(cam);},first=placed.poses[0],last=placed.poses.at(-1),nose=at(first,first.start),tail=at(last,last.end);
  assert.ok(nose.x<-.3&&tail.x>.3,`the nose is at the left of the plan and the tail at the right: ${nose.x.toFixed(3)}, ${tail.x.toFixed(3)}`);}
 assert.deepEqual([plan.joints[0].gangway.left.side,plan.joints[0].gangway.right.side],outside<0?['outside','inside']:['inside','outside'],'the plan gives its joints the outside of the bend');
 assert.equal(plan.frame,'curve');
 // each is turned by the sun-bearing rule, as every other view is
 for(const v of plan.views){const {rotation,...bare}=v;assert.deepEqual(rotation,F.stageRotation(bare));}
 // framing: every corner of every car, at the rail and at the roof, padded, is inside 84% of the image, and the worst one is on it; the cameras look at the middle of the footprint, which
 // the view says it frames, in the region it is taken for and with a near plane that is the catalogue's
 const framed=(views,f,poses)=>{
  const q=x=>Math.round(x*1e6)/1e6,seen=[];
  for(const v of views) {
   const cam=new T.PerspectiveCamera(v.fov,F.CATALOGUE.aspect,.01,1e5);cam.position.set(...v.eye);cam.up.set(...v.up);cam.lookAt(...v.target);cam.updateMatrixWorld(true);cam.updateProjectionMatrix();
   let worst=0;seen.length=0;
   for(const pose of poses) {
    const node=new T.Group();node.position.set(pose.position[0],0,pose.position[1]);node.rotation.y=pose.rotationY;node.scale.set(1,1,pose.scaleZ);node.updateMatrixWorld(true);
    // the pad is in the car's own metres along it, so the car's stretch is divided out
    for(const [sx,z] of [[-1,pose.start-F.CURVE.padM],[1,pose.start-F.CURVE.padM],[1,pose.end+F.CURVE.padM],[-1,pose.end+F.CURVE.padM]])for(const y of [0,f.roofTop]) {
     const w=node.localToWorld(new T.Vector3(sx*(f.half+F.CURVE.padM),y,z)),n=w.clone().project(cam);
     assert.ok(Math.abs(n.x)<=F.CATALOGUE.fitFraction+1e-6&&Math.abs(n.y)<=F.CATALOGUE.fitFraction+1e-6,`${v.suffix}: car ${pose.index} corner at ${n.x.toFixed(4)}, ${n.y.toFixed(4)}`);
     worst=Math.max(worst,Math.abs(n.x),Math.abs(n.y));seen.push([w.x,w.z]);
    }
   }
   near(worst,F.CATALOGUE.fitFraction,.004,`${v.suffix}: nearer would cut a corner`);
   const xs=seen.map(c=>c[0]),zs=seen.map(c=>c[1]),bounds=[Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs)],centre=[(bounds[0]+bounds[1])/2,(bounds[2]+bounds[3])/2];
   vec([v.target[0],v.target[2]],centre,2e-6,`${v.suffix}: the middle of the footprint`);
   assert.deepEqual(v.region,{min:[q(bounds[0]),0,q(bounds[2])],max:[q(bounds[1]),q(f.roofTop+F.CURVE.padM),q(bounds[3])]},`${v.suffix}: the region is the footprint, to a micrometre, as high as the padded roof`);
   assert.deepEqual(v.notes.footprintM,{x:[q(bounds[0]),q(bounds[1])],z:[q(bounds[2]),q(bounds[3])]},`${v.suffix}: the footprint it says it frames`);
   assert.equal(v.near,F.catalogueNear(v.eye,v.target),`${v.suffix}: the near plane`);
  }
 };
 framed(plan.views,f,placed.poses);
 // a short low car is framed by its corner at the rail, which a train as tall as the real ones never is: the corners at the rail count
 const low={roofTop:3,half:1.4,length:2},lowPoses=[{index:0,start:0,end:2,position:[.3,-1],rotationY:.2,scaleZ:1}];
 framed(safely(()=>F.planCurveViews(low,{local:{outsideSign:-1}},lowPoses)),low,lowPoses);
 assert.ok(top.region.max[1]>=f.roofTop&&top.region.min[1]<=0);
 // the cars to pose, the bogies they stand on and the nose
 assert.equal(plan.cars.length,f.cars.length);assert.equal(plan.bogies.length,2*f.cars.length);assert.deepEqual(plan.bogies.slice(0,2).map(b=>[b.name,b.car,b.k]),[['bogie-0-0',0,0],['bogie-0-1',0,1]]);
 assert.equal(plan.joints.length,f.cars.length-1);assert.equal(plan.noseM,Math.round(placed.noseM*1e6)/1e6);assert.equal(plan.lengthM,f.length);
 assert.equal(plan.reason,null);assert.equal(plan.route.source,'synthetic');assert.equal(plan.route.smooth,false);assert.equal(plan.route.edges,0);assert.equal(plan.notes.rule,F.CURVE_RULE);assert.equal(plan.notes.stage,F.CURVE_STAGE);assert.deepEqual(plan.path,route.local.points);
 assert.equal(plan.route.note,route.note);assert.equal(plan.route.outsideSign,route.local.outsideSign);assert.equal(plan.route.headingDeg,route.local.headingDeg);
});

check('a placement the geometry does not vouch for, or one that poses too few cars, makes the plan a GAP with the reason and nothing to photograph',()=>{
 const {f,route,curve,placed}=arcPlaced('gn387x4',100),gaps=extra=>safely(()=>F.planCurve(f,route,{poses:placed.poses,cars:placed.cars,noseM:placed.noseM,...extra},{gangwayWidthM:bodySpec(f.family).gangway.width,endGapM:END_GAP}));
 const few=gaps({poses:placed.poses.slice(0,3)});assert.equal(few.status,'GAP');assert.equal(few.reason,`carPoses posed 3 of the ${f.cars.length} cars of gn387x4`);
 const many=gaps({poses:[...placed.poses,placed.poses[0]]});assert.equal(many.status,'GAP');assert.equal(many.reason,`carPoses posed ${f.cars.length+1} of the ${f.cars.length} cars of gn387x4`,'one too many is as wrong as one too few');
 assert.equal(gaps({noseM:123.4567891234}).noseM,123.456789,'the nose is given to a micrometre');
 // the summary of the route is what the plan and every sidecar say of it, field by field, from the route\'s own; a note rides along only if the route has one
 const real={source:'real',smooth:true,radiusM:81.8,turnDeg:18.2,baselineM:26,apex:[-174.07,25.85],lengthM:199.5,apexS:100.25,steps:[{},{},{}],ways:[111564944,164434922],services:['main','relief'],tunnel:{inWindow:.4,atApex:true},
  local:{headingDeg:33.5,outsideSign:-1,lengthM:200.25,apexS:101.25,points:route.local.points}},realSpec={gangwayWidthM:bodySpec(f.family).gangway.width,endGapM:END_GAP};
 const summed=safely(()=>F.planCurve(f,real,placed,realSpec));
 assert.deepEqual(summed.route,{source:'real',smooth:true,radiusM:81.8,turnDeg:18.2,baselineM:26,apex:[-174.07,25.85],headingDeg:33.5,outsideSign:-1,lengthM:200.25,apexS:101.25,edges:3,ways:[111564944,164434922],services:['main','relief'],tunnel:{inWindow:.4,atApex:true}});
 assert.deepEqual(summed.notes,{stage:F.CURVE_STAGE,route:summed.route,rule:F.CURVE_RULE});assert.equal(F.planCurve(f,{...real,note:'a note'},placed,realSpec).route.note,'a note');assert.equal(F.planCurve(f,{...real,smooth:1},placed,realSpec).route.smooth,false,'smooth is true or it is not');
 assert.deepEqual([summed.joints[0].gangway.left.side,summed.joints[0].gangway.right.side],['outside','inside']);const mirrored=F.planCurve(f,{...real,local:{...real.local,outsideSign:1}},placed,realSpec);assert.deepEqual([mirrored.joints[0].gangway.left.side,mirrored.joints[0].gangway.right.side],['inside','outside']);
 const wrong=gaps({problems:['bogie 1 is somewhere else','car 2 is turned','car 3 is stretched','car 4 is gone']});assert.equal(wrong.status,'GAP');assert.equal(wrong.reason,"the page's placement code (carPoses) disagrees with the geometry: bogie 1 is somewhere else; car 2 is turned; car 3 is stretched");
 const both=gaps({poses:[],problems:['x']});assert.equal(both.reason,`the page's placement code (carPoses) disagrees with the geometry: x; carPoses posed 0 of the ${f.cars.length} cars of gn387x4`);
 for(const gap of [few,wrong,both]){assert.deepEqual([gap.views,gap.cars,gap.bogies,gap.joints,gap.checks,gap.noseM],[[],[],[],[],null,null]);assert.equal(gap.id,'C01');assert.equal(gap.suffix,'curve');assert.equal(gap.lengthM,f.length);assert.deepEqual(gap.path,route.local.points);assert.equal(gap.route.source,'synthetic');assert.equal(gap.notes.rule,F.CURVE_RULE);}
 assert.equal(gaps({problems:[]}).status,'OK');assert.equal(gaps({}).status,'OK');
 assert.deepEqual(F.curveVerdict(few),{status:'NOT RUN',findings:[],bodies:null,couplers:null,gangways:null,bogies:null});
 // what is frozen of a plan is its geometry, not the verdicts or what the page read
 const ok=gaps({});assert.deepEqual(Object.keys(F.curvePoseOf(ok)),['status','lengthM','route','path','views']);assert.deepEqual(F.curvePoseOf(ok).views,ok.views.map(F.poseOf));assert.deepEqual(F.curvePoseOf(few),{status:'GAP',lengthM:f.length,route:few.route,path:few.path,views:[]});
});

// ---- what the page has --------------------------------------------------------------------------------------------------------------------------
check('the cars and bogies of a specimen are read as they stand: transforms of the car nodes, and each bogie that is shown, in the specimen\'s frame and in the world',()=>{
 const group=new T.Group();group.name='train-x';group.position.set(5,0,-7);group.rotation.y=.5;
 const car=(n,x,z,visible=true)=>{const c=new T.Group();c.name=`car-${n}`;c.position.set(x,0,z);c.rotation.y=.1*n;c.scale.set(1,1,1+.01*n);c.visible=visible;group.add(c);return c;};
 const c0=car(0,0,0),c1=car(1,1,30,false),c12=car(12,2,60);group.add(Object.assign(new T.Group(),{name:'not-a-car'}),Object.assign(new T.Group(),{name:'car-x'}),Object.assign(new T.Group(),{name:'scar-5'}),Object.assign(new T.Group(),{name:'car-7x'}));
 const bogie=(parent,name,x,z,visible=true)=>{const b=new T.Group();b.name=name;b.position.set(x,0,z);b.visible=visible;parent.add(b);return b;};
 bogie(c0,'bogie-0-0',0,3);bogie(c0,'bogie-0-1',0,20);bogie(c1,'bogie-1-0',0,3);bogie(c12,'bogie-12-13',0,4);bogie(c0,'old-bogie-3-1',0,5);bogie(c0,'bogie-3-1b',0,6);const hidden=bogie(c0,'bogie-0-2',0,30,false);bogie(hidden,'bogie-9-9',0,0);bogie(c0,'wheel-1',0,1);
 const cars=safely(()=>F.readCars(group));
 assert.deepEqual(cars.map(c=>c.name),['car-0','car-1','car-12'],'a car of any number, named exactly');assert.deepEqual(cars.map(c=>c.visible),[true,false,true]);vec(cars[1].position,[1,0,30]);near(cars[1].rotationY,.1);near(cars[1].scaleZ,1.01);
 const bogies=safely(()=>F.readBogiePoints(T,group));
 assert.deepEqual(bogies.map(b=>b.name).sort(),['bogie-0-0','bogie-0-1','bogie-12-13'],'only the bogies that are shown, named exactly and of any number: the car that is hidden hides its bogies and the bogie that is hidden hides its children');
 assert.deepEqual([bogies.find(x=>x.name==='bogie-12-13').car,bogies.find(x=>x.name==='bogie-12-13').k],[12,13]);
 const b=bogies.find(x=>x.name==='bogie-0-1');assert.deepEqual([b.car,b.k],[0,1]);
 // the world is the group's transform of the bogie\'s place; the local is the group\'s own frame (what the route is in)
 const world=new T.Vector3(0,0,20).applyMatrix4(c0.matrixWorld);vec(b.world,world.toArray(),1e-9);vec(b.local,[0,0,20],1e-9);
 vec(group.localToWorld(new T.Vector3(...b.local)).toArray(),b.world,1e-9,'one is the other seen through the group');
});

check('what the page has is judged against the plan: a bogie off the track is a finding, a car or bogie that is not as it was put is a problem, and the verdict says which',()=>{
 const path=[[0,0],[0,-100]],plan={path,cars:[{index:0,position:[0,0],rotationY:0,scaleZ:1,bogies:[]}],bogies:[{name:'bogie-0-0',car:0,k:0,point:[0,-10]},{name:'bogie-0-1',car:0,k:1,point:[0,-30]}],checks:{findings:[{check:'coupler'}],bodies:{x:1},couplers:{x:2},gangways:{x:3}}};
 // the page's car node reads its position as [x, y, z]; the plan has [x, z]
 const cars=[{name:'car-0',visible:true,position:[0,0,0],rotationY:0,scaleZ:1}],read=(bogies,carsRead=cars)=>({cars:carsRead,bogies});
 const on=[{name:'bogie-0-0',car:0,k:0,local:[0,0,-10],world:[1,0,-10]},{name:'bogie-0-1',car:0,k:1,local:[0,0,-30],world:[1,0,-30]}];
 const fine=safely(()=>F.judgeCurvePage(plan,read(on)));
 assert.deepEqual(fine.problems,[]);assert.deepEqual(fine.findings,[]);assert.equal(fine.rows.length,2);assert.equal(fine.bogies.ok,true);assert.equal(fine.bogies.count,2);assert.equal(fine.bogies.toleranceM,.01);near(fine.bogies.maxOffTrackM,0,1e-12);near(fine.bogies.maxPlannedErrorM,0,1e-12);
 assert.deepEqual(fine.rows[0],{name:'bogie-0-0',car:0,k:0,plannedPoint:[0,-10],local:[0,0,-10],world:[1,0,-10],offTrackM:0,plannedErrorM:0});
 // 1 cm is on the track; more is not; and a bogie that is above the rail head is not on it
 const off=(dx,dy=0)=>[{...on[0],local:[dx,dy,-10]},on[1]];
 assert.deepEqual(F.judgeCurvePage(plan,read(off(.01))).findings,[],'1 cm is on the track');
 const wide=F.judgeCurvePage(plan,read(off(.0101)));assert.equal(wide.findings.length,1);assert.deepEqual([wide.findings[0].check,wide.findings[0].bogie,wide.findings[0].toleranceM],['bogie-on-track','bogie-0-0',.01]);assert.match(wide.findings[0].message,/^bogie-0-0 stands 0\.0101 m from the track, more than the 0\.01 m allowed$/);
 assert.equal(wide.bogies.ok,false);near(wide.bogies.maxOffTrackM,.0101,1e-12);near(wide.bogies.maxPlannedErrorM,.0101,1e-12);
 assert.equal(F.judgeCurvePage(plan,read(off(0,.02))).findings.length,1,'height counts');assert.equal(F.judgeCurvePage(plan,read(off(0,.01))).findings.length,0);
 assert.equal(F.judgeCurvePage(plan,read(off(.5)),{toleranceM:1}).findings.length,0,'the tolerance is a parameter');
 // a bogie that stands on the track but not where it was planned is not a finding of the track (the car pose checks that)
 const slid=F.judgeCurvePage(plan,read([{...on[0],local:[0,0,-12]},on[1]]));assert.deepEqual(slid.findings,[]);near(slid.bogies.maxPlannedErrorM,2,1e-12);near(slid.bogies.maxOffTrackM,0,1e-12);
 // problems: a bogie missing, twice or not planned; a car that is not where it was put
 assert.match(F.judgeCurvePage(plan,read([on[0]])).problems[0],/^the page reports no bogie-0-1$/);
 assert.match(F.judgeCurvePage(plan,read([...on,on[0]])).problems[0],/^the page reports bogie-0-0 twice$/);
 assert.match(F.judgeCurvePage(plan,read([...on,{name:'bogie-7-0',local:[0,0,0],world:[0,0,0]}])).problems[0],/^the page reports bogie-7-0, which the plan has not$/);
 assert.equal(F.judgeCurvePage(plan,read(on,[{...cars[0],visible:false}])).problems.length,1,'a car that is hidden is not as it was put');
 assert.equal(F.judgeCurvePage(plan,{cars:[],bogies:on}).problems.length>0,true,'no cars read');assert.equal(F.judgeCurvePage(plan,{bogies:on}).problems[0],'the specimen has 0 cars, the capture posed 1','no list of cars at all');assert.equal(F.judgeCurvePage(plan,{cars:read(on).cars}).problems.length,2,'no bogies read: both missing');
 // a bogie that is not a number from the track is not on it; one missing is a problem, so the bogies are not ok though none is off the track, and it is not counted
 const nan=F.judgeCurvePage(plan,read([{...on[0],local:[NaN,0,-10]},on[1]]));assert.equal(nan.findings.length,1);assert.equal(nan.bogies.ok,false);
 const missing=F.judgeCurvePage(plan,read([on[0]]));assert.deepEqual(missing.findings,[]);assert.equal(missing.bogies.ok,false);assert.equal(missing.bogies.count,1);
 const nothing=F.judgeCurvePage(plan,{cars});assert.deepEqual([nothing.rows.length,nothing.bogies.count,nothing.bogies.maxOffTrackM,nothing.bogies.maxPlannedErrorM],[0,0,0,0],'none read: nothing is off the track');
 // height counts in the distance from where it was put, and a row says which car and which of its bogies
 near(F.judgeCurvePage(plan,read(off(0,.02))).rows[0].plannedErrorM,.02,1e-12);assert.deepEqual([fine.rows[1].car,fine.rows[1].k],[0,1]);
 const row=F.judgeCurvePage({...plan,bogies:[{name:'bogie-2-1',car:2,k:1,point:[0,-10]}]},{cars,bogies:[{name:'bogie-2-1',car:2,k:1,local:[0,0,-10],world:[0,0,-10]}]}).rows[0];assert.deepEqual([row.car,row.k],[2,1]);
 // a bogie reported twice is a problem, and the later report is the one measured
 const twice=F.judgeCurvePage(plan,read([on[0],{...on[0],local:[.5,0,-10]},on[1]]));assert.match(twice.problems[0],/twice/);assert.equal(twice.findings.length,1,'the later report is the one measured');assert.deepEqual(twice.rows[0].local,[.5,0,-10]);
 // the verdict: the joints\' findings first, then the page\'s
 assert.deepEqual(F.curveVerdict(plan,fine),{status:'FINDING',findings:[{check:'coupler'}],bodies:{x:1},couplers:{x:2},gangways:{x:3},bogies:fine.bogies});
 const clean={...plan,checks:{...plan.checks,findings:[]}};assert.equal(F.curveVerdict(clean,fine).status,'PASS');assert.equal(F.curveVerdict(clean).status,'PASS');assert.equal(F.curveVerdict(clean).bogies,null,'the page was never read');assert.equal(F.curveVerdict(clean,null).bogies,null);
 const both=F.curveVerdict(clean,wide);assert.equal(both.status,'FINDING');assert.deepEqual(both.findings.map(x=>x.check),['bogie-on-track']);assert.deepEqual(F.curveVerdict(plan,wide).findings.map(x=>x.check),['coupler','bogie-on-track']);
});

check('C02 plans a kind as C01 does under names of its own: the same cameras, joints and checks on the same route, the id, suffix, views and rule of the typical curve, and the pick of the route in the summary',()=>{
 const {f,route,placed}=arcPlaced('gn387x4',452),given={gangwayWidthM:bodySpec(f.family).gangway.width,endGapM:END_GAP};
 const one=safely(()=>F.planCurve(f,route,placed,given)),two=safely(()=>F.planCurve(f,route,placed,given,F.CURVE_NORMAL));
 assert.equal(two.status,'OK');assert.deepEqual([one.id,one.suffix,one.notes.rule],['C01','curve',F.CURVE_RULE]);assert.deepEqual([two.id,two.suffix,two.notes.rule],['C02','curve-normal',F.CURVE_NORMAL_RULE]);
 assert.deepEqual(two.views.map(v=>[v.id,v.suffix,v.frame]),F.CURVE_NORMAL_VIEWS.map(suffix=>['C02',suffix,'curve']));assert.deepEqual(one.views.map(v=>[v.id,v.suffix]),F.CURVE_VIEWS.map(suffix=>['C01',suffix]));
 // nothing else differs: the cameras, the joints and the verdicts are the route\'s
 const bare=p=>({...p,id:null,suffix:null,notes:{...p.notes,rule:null},views:p.views.map(({id,suffix,...rest})=>rest)});
 assert.deepEqual(bare(two),bare(one));
 assert.deepEqual(safely(()=>F.planCurveViews(f,route,placed.poses,{curve:F.CURVE_NORMAL})),two.views);assert.deepEqual(F.planCurveViews(f,route,placed.poses),one.views,'C01 is the default');
 assert.deepEqual(F.planCurveViews(f,route,placed.poses,{aspect:1.2,curve:F.CURVE_NORMAL}).map(v=>v.suffix),F.CURVE_NORMAL_VIEWS,'the aspect and the curve are separate options');
 // the pick of a route is in the plan\'s summary, in the notes and in what is frozen; a route without one has none
 const pick={kind:'typical',typicalRadiusM:452,bandShare:.1,meanDeviation:.3,tightestM:400,straightM:9},picked=safely(()=>F.planCurve(f,{...route,pick},placed,given,F.CURVE_NORMAL));
 assert.deepEqual(picked.route.pick,pick);assert.deepEqual(picked.notes.route.pick,pick);assert.deepEqual(F.curvePoseOf(picked).route.pick,pick);assert.ok(!('pick' in two.route)&&!('pick' in F.curvePoseOf(two).route));
 // a plan that is a GAP is still C02\'s
 const gap=F.planCurve(f,route,{...placed,problems:['x']},given,F.CURVE_NORMAL);assert.deepEqual([gap.status,gap.id,gap.suffix,gap.notes.rule],['GAP','C02','curve-normal',F.CURVE_NORMAL_RULE]);
 // every kind on the typical radius of the page\'s track, on an arc of it: no check fails
 for(const kind of ALL_KINDS) {
  const {curve}=arcPlaced(kind,452),plan=safely(()=>C.planCurveFor(formations.get(kind),curve,undefined,F.CURVE_NORMAL));
  assert.equal(plan.status,'OK',`${kind}: ${plan.reason}`);assert.equal(plan.id,'C02');assert.deepEqual(plan.checks.findings,[],`${kind}: the joints hold on a bend of 452 m`);assert.equal(plan.checks.bodies.ok,true);
 }
});

// ---- the stage ----------------------------------------------------------------------------------------------------------------------------------
check('the stage follows the route: ballast, sleepers square to it every 65 cm and two rails a gauge apart, all of it named, owned by the capture and 0 at the rail head',()=>{
 const arc=safely(()=>F.circularArcRoute(130,100)),points=F.curveFrame(arc).points,stage=safely(()=>F.buildCurveStage(T,{points}));
 assert.equal(stage.name,'capture-stage');assert.equal(stage.userData.captureOwned,true);assert.match(stage.userData.note,/capture-only neutral curved specimen stage; not part of the model/);
 assert.deepEqual(stage.children.map(c=>c.name),['capture-stage-ground','capture-stage-ballast','capture-stage-sleepers','capture-stage-rail-left','capture-stage-rail-right']);
 const cum=F.cumulative(points),total=cum.at(-1);
 const levels=stage.userData.levels;assert.deepEqual({...levels,route:undefined},{groundY:F.CATALOGUE.groundY,ballastTopY:F.CATALOGUE.groundY+.06,sleeperTopY:-.1,railHeadTopY:0,railCentreX:F.CATALOGUE.gaugeM/2,ballastWidthM:3.4,sleepers:Math.floor(total/.65),route:undefined});
 assert.deepEqual(levels.route,{points:points.length,lengthM:Math.round(total*1e6)/1e6});
 const part=name=>stage.getObjectByName(name),vertices=mesh=>{const a=mesh.geometry.attributes.position;return Array.from({length:a.count},(_,i)=>[a.getX(i),a.getY(i),a.getZ(i)]);};
 // the rails: each vertex of a rail head is within half a head width of a gauge from the centre line, the left one on the left of the travel (travel is -z at the tightest point, so left is -x)
 for(const [name,side] of [['capture-stage-rail-left',-1],['capture-stage-rail-right',1]]) {
  const vs=vertices(part(name)),offs=vs.map(v=>F.polylineDistance(points,[v[0],v[2]]));
  assert.ok(Math.min(...offs)>=F.CATALOGUE.gaugeM/2-F.CATALOGUE.railHeadWidthM/2-.02&&Math.max(...offs)<=F.CATALOGUE.gaugeM/2+F.CATALOGUE.railHeadWidthM/2+.02,`${name}: a gauge apart (${Math.min(...offs)}..${Math.max(...offs)})`);
  const nearApex=vs.filter(v=>Math.abs(v[2])<1);assert.ok(nearApex.length>0&&nearApex.every(v=>Math.sign(v[0])===side),`${name} is on the ${side<0?'left':'right'} of the travel`);
  assert.ok(vs.every(v=>v[1]<=1e-6&&v[1]>=-.1-1e-6),'the rail head is from -0.1 to 0');near(Math.max(...vs.map(v=>v[1])),0,1e-6,'its top is 0');near(Math.min(...vs.map(v=>v[1])),-.1,1e-6);
 }
 const ballast=vertices(part('capture-stage-ballast'));assert.ok(Math.max(...ballast.map(v=>F.polylineDistance(points,[v[0],v[2]])))<=1.7+.05&&Math.max(...ballast.map(v=>F.polylineDistance(points,[v[0],v[2]])))>=1.7-.05,'3.4 m wide');
 near(Math.max(...ballast.map(v=>v[1])),F.CATALOGUE.groundY+.06,1e-6,'ballast top');
 // sleepers: one every 65 cm along the route, on it, each square to it
 const sleepers=part('capture-stage-sleepers');assert.equal(sleepers.isInstancedMesh,true);assert.equal(sleepers.count,Math.floor(total/.65));
 const m=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();
 for(const i of [0,1,100,sleepers.count-1]) {
  sleepers.getMatrixAt(i,m);m.decompose(p,q,s);const at=F.pointAlong(points,cum,.325+i*.65);
  vec([p.x,p.z],at,2e-4,`sleeper ${i} is on the route at ${.325+i*.65} m (the matrix is 32-bit)`);near(p.y,-.125,1e-6);
  const across=new T.Vector3(1,0,0).applyQuaternion(q),i0=F.segmentAt(cum,.325+i*.65),along=[points[i0+1][0]-points[i0][0],points[i0+1][1]-points[i0][1]];
  near(across.x*along[0]+across.z*along[1],0,1e-5,`sleeper ${i} is square to the track`);
 }
 // the ground is a plane under it at the ground level, as big as the other stages\'
 const ground=part('capture-stage-ground');near(ground.position.y,F.CATALOGUE.groundY,1e-12);assert.equal(vertices(ground).length>=4,true);
 // geometry per run: a longer route has more sleepers, and a route of two points is a straight stage
 const straight=F.buildCurveStage(T,{points:[[0,0],[0,-100]]});assert.equal(straight.userData.levels.sleepers,Math.floor(100/.65));assert.equal(straight.getObjectByName('capture-stage-rail-left').geometry.attributes.position.count,24);
});

// ---- the page\'s own placement over a chain of edges ----------------------------------------------------------------------------------------------
/** Three edges of a smooth way travelled against the order of the way's nodes, with the middle one stored the other way round: edge.a is not always where the train enters. */
const chainTrack=()=>{
 const bend=arcWay({R:150,spacing:40,count:7,idBase:10,wayId:5}),ids=bend.rails[0].nodes;
 // way 5 runs 10..16; add way 6 stored backwards between 12 and 13 would repeat an edge, so instead store the second half of the nodes as its own way listed from the far end
 const first={nodes:bend.nodes,rails:[{id:5,nodes:ids.slice(0,4),tunnel:false,service:'main'},{id:6,nodes:ids.slice(3).reverse(),tunnel:false,service:'main'}]};
 return {data:first,ids};
};
check('a chain of the page\'s edges: the train enters each edge at one end or the other, and its view is the motion model\'s own, read off the curve',()=>{
 const {data,ids}=chainTrack(),graph=buildGraph(data,{curves:true}),edgeBetween=(a,b)=>graph.adj.get(a).find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a));
 const steps=[[10,11],[11,12],[12,13],[13,14],[14,15],[15,16]].map(([from,to])=>({edge:edgeBetween(from,to),from}));
 assert.deepEqual(steps.map(s=>s.edge.a<s.edge.b),[true,true,true,false,false,false],'the second way is stored from 16 down to 13');
 const chain=safely(()=>C.chainRoute(graph,steps));
 assert.deepEqual(chain.steps.map(s=>s.forward),[true,true,true,false,false,false]);near(chain.lengthM,steps.reduce((n,s)=>n+s.edge.length,0),1e-9);assert.equal(chain.cum.length,7);assert.equal(chain.cum[0],0);chain.steps.forEach((s,i)=>near(chain.cum[i+1]-chain.cum[i],s.edge.length,1e-12));assert.equal(chain.graph,graph);
 // a train 100 m long with its nose 190 m along: the tail is 90 m along, 10 m into the third edge
 const view=safely(()=>C.chainViewAt(chain,190,100,{id:4,speed:11}));
 assert.deepEqual([view.id,view.speed,view.lengthM,view.state,view.opacity,view.description,view.blocked,view.reversals,view.distanceM],[4,11,100,'moving',1,'capture',false,0,190]);
 assert.deepEqual([view.targetBerth,view.lastBerth],['',''],'a train on a route is on its way to and from no berth');
 const len=i=>chain.steps[i].lengthM;
 // the occupied intervals run tail to nose, and an edge stored the other way is run from t = 1 down to 0
 const spans=view.occupied.map(o=>[o.edge,o.fromT,o.toT]);
 assert.equal(view.occupied.length,3);assert.equal(view.occupied[0].edge,steps[2].edge);assert.equal(view.occupied[2].edge,steps[4].edge);
 near(view.occupied[0].fromT,(90-chain.cum[2])/len(2),1e-12);near(view.occupied[0].toT,1,1e-12);
 near(view.occupied[1].fromT,1-0,1e-12);near(view.occupied[1].toT,1-(len(3)/len(3)),1e-12);
 near(view.occupied[2].fromT,1,1e-12);near(view.occupied[2].toT,1-(190-chain.cum[4])/len(4),1e-12);assert.ok(view.occupied[2].fromT>view.occupied[2].toT,'against the edge: from b toward a');
 near(view.occupiedLengthM,100,1e-9);
 // the nose is where the curve has it
 assert.equal(view.leading.edge,steps[4].edge);near(view.leading.t,view.occupied[2].toT,1e-12);vec(view.leading.point,edgePoint(graph,steps[4].edge,view.leading.t).point,1e-12);
 // heading: clockwise from north along the direction of travel at the nose (the arc travels north and bends right: east of north)
 const d=edgePoint(graph,steps[4].edge,view.leading.t).dir;near(view.heading,Math.atan2(-d[0],d[1]),1e-12,'against the edge, so the other way along its direction');assert.ok(view.heading>0&&view.heading<Math.PI/2);
 // the same train with its nose in a forward edge reads the edge\'s own direction
 const early=C.chainViewAt(chain,60,40);
 assert.equal(early.leading.edge,steps[1].edge,'60 m along is on the second edge');const e1=edgePoint(graph,steps[1].edge,early.leading.t).dir;near(early.heading,Math.atan2(e1[0],-e1[1]),1e-12);
 assert.equal(early.occupied.length,2);near(early.occupied[0].fromT,20/len(0),1e-12);near(early.occupied[0].toT,1,1e-12);near(early.occupied[1].fromT,0,1e-12);near(early.occupied[1].toT,(60-chain.cum[1])/len(1),1e-12);
 // the arc of 150 m starts heading 0.8 radians west of north and turns right by 1/150 radian a metre: 60 m on, near the middle of the second edge, it heads -0.4, as that edge\'s chord does, and the curve is within a hundredth of it there
 near(early.heading,-.8+60/150,.01,'the heading is read off the curve at the nose');
 // a nose exactly on a node leaves no empty interval beyond it
 const onNode=C.chainViewAt(chain,chain.cum[2],30);assert.equal(onNode.occupied.at(-1).edge,steps[1].edge);near(onNode.leading.t,1,1e-12);
 // a nose a tenth of a millimetre into the next edge is in it, and leads on it
 const sliver=C.chainViewAt(chain,chain.cum[2]+1e-4,30);assert.equal(sliver.leading.edge,steps[2].edge);near(sliver.leading.t,1e-4/len(2),1e-9);assert.equal(sliver.occupied.length,2);
 // a tail or a nose half a nanometre beyond the ends of the route is rounding; two nanometres is not
 assert.doesNotThrow(()=>C.chainViewAt(chain,100-5e-10,100),'a tail a hair before the start');assert.doesNotThrow(()=>C.chainViewAt(chain,chain.lengthM+5e-10,50),'a nose a hair past the end');
 assert.throws(()=>C.chainViewAt(chain,100-2e-9,100),/does not fit a route/);assert.throws(()=>C.chainViewAt(chain,chain.lengthM+2e-9,50),/does not fit a route/);
 // refused: not on the route, an edge that is not entered where the last one left, a train that does not fit, a train that is nowhere
 assert.throws(()=>C.chainRoute(graph,[]),/a route needs at least one edge/);assert.throws(()=>C.chainRoute(graph,'x'),/at least one edge/);
 assert.throws(()=>C.chainRoute(graph,[{edge:steps[0].edge,from:99}]),/step 0 enters edge 10-11 at node 99, which is not on it/);
 assert.throws(()=>C.chainRoute(graph,[steps[0],steps[2]]),/step 1 enters at node 12, but step 0 leaves at node 11/);
 assert.throws(()=>C.chainViewAt(chain,chain.lengthM+1,50),/a train 50 m long with its nose .* does not fit a route .* m long/);assert.throws(()=>C.chainViewAt(chain,40,50),/does not fit a route/);assert.throws(()=>C.chainViewAt(chain,100,0),/occupies none of the route/);
 // carPoses over it puts a bogie where the curve has it, edge stored either way, at the distance behind the nose
 const layout=trainLayout('gn387x4'),poses=carPoses(graph,C.chainViewAt(chain,200,formations.get('gn387x4').length),layout);
 assert.equal(poses.length,layout.cars.length);
 const at=(m)=>{const k=F.segmentAt(chain.cum,m),u=(m-chain.cum[k])/chain.steps[k].lengthM;return edgePoint(graph,chain.steps[k].edge,chain.steps[k].forward?u:1-u).point;};
 for(const p of poses){vec(p.frontBogie.point,at(200-p.car.bogies[0]),1e-9,`car ${p.car.index} front bogie`);vec(p.rearBogie.point,at(200-p.car.bogies[1]),1e-9,`car ${p.car.index} rear bogie`);}
});

check('the placement route is the page\'s edges for a route found on its track and the chords of the arc for the synthetic one, with the oracle for where a bogie must stand',()=>{
 const {data}=chainTrack(),graph=buildGraph(data,{curves:true}),route=F.curveRouteFor(data,60,{shapeOf:shapesOf(data)}),placement=safely(()=>C.placementRoute(route,graph));
 assert.equal(placement.chain.graph,graph);assert.equal(placement.chain.steps.length,route.steps.length);
 placement.chain.steps.forEach((s,i)=>{assert.equal(s.edge.wayId,route.steps[i].way);assert.equal(s.forward,s.edge.a===route.steps[i].from);});
 near(placement.apexM,placement.chain.cum[route.apexAt.step]+route.apexAt.share*placement.chain.steps[route.apexAt.step].lengthM,1e-12,'the tightest point, in the page\'s own measure');
 // where(m) puts the route at m along the chain, by the route\'s own points: the node at the start of each edge
 placement.chain.cum.slice(0,-1).forEach((m,i)=>vec(placement.where(m),route.points[route.steps[i].fromIndex],2e-6,`start of step ${i}`));vec(placement.where(placement.chain.lengthM),route.points.at(-1),2e-6);
 // and it is the page\'s curve: edgePoint gives the same place to within the micrometres the route is rounded to
 for(const m of [3,77.7,placement.chain.lengthM/2,placement.chain.lengthM-1]){const k=F.segmentAt(placement.chain.cum,m),s=placement.chain.steps[k],u=(m-placement.chain.cum[k])/s.lengthM;vec(placement.where(m),edgePoint(graph,s.edge,s.forward?u:1-u).point,F.CURVE.placementToleranceM,`at ${m}`);}
 assert.throws(()=>C.placementRoute({...route,steps:[{...route.steps[0],way:424242}]},graph),/the page's graph has no edge of way 424242 between nodes 10 and 11/);
 // the synthetic arc: a polyline of chords, no curves, the oracle is the polyline itself
 const arc=F.curveRouteFor({nodes:[],rails:[]},100),flat=C.placementRoute(arc);
 assert.equal(flat.chain.steps.length,arc.points.length-1);assert.ok(flat.chain.steps.every(s=>s.forward));assert.equal(flat.apexM,arc.apexS);assert.equal(flat.chain.graph.shapes,undefined,'straight chords: edgePoint takes the chord');
 vec(flat.where(flat.apexM),[0,0],1e-6);near(flat.chain.lengthM,F.cumulative(arc.points).at(-1),1e-9);
});

check('the poses of a kind on a route are the page\'s carPoses, checked against the geometry, and a carPoses that is wrong is found, whatever it gets wrong',()=>{
 const {data}=chainTrack(),big=arcWay({R:150,spacing:40,count:15,idBase:10,wayId:5}),graph=buildGraph(big,{curves:true});
 const f=formations.get('gn387x4'),route=F.curveRouteFor(big,f.length,{shapeOf:shapesOf(big)}),curve={route,placement:C.placementRoute(route,graph)};
 const good=safely(()=>C.curvePoses(f,curve));
 assert.equal(good.ok,true);assert.deepEqual(good.problems,[]);assert.ok(good.maxErrorM<F.CURVE.placementToleranceM&&good.maxErrorM>=0);assert.equal(good.poses.length,f.cars.length);assert.equal(good.cars.length,f.cars.length);
 near(good.noseM,curve.placement.apexM+f.length/2,1e-12,'the middle of the train is on the tightest point');assert.deepEqual(good.route,{points:route.points.length,lengthM:route.lengthM});
 // the poses are in the frame of the route: the middle of the train is at the origin, facing along -z
 const before=good.poses.filter(p=>p.end<=f.length/2+1e-9).at(-1),after=good.poses.find(p=>p.start>=f.length/2-1e-9),ends=[F.carPoint(before,0,before.end),F.carPoint(after,0,after.start)];
 assert.ok(before.end===f.length/2&&after.start===f.length/2,'the middle of the train is a joint');
 ends.forEach((end,i)=>assert.ok(Math.hypot(...end)<.5,`the end of car ${before.index+i} at the middle of the train is by the tightest point (a car is a chord and the track a curve): ${end}`));
 for(const p of good.poses){assert.deepEqual(Object.keys(p),['index','start','end','bogies','position','rotationY','scaleZ','front','rear']);}
 good.poses.forEach((p,i)=>assert.deepEqual([p.index,p.start,p.end,p.bogies],[f.cars[i].index,f.cars[i].start,f.cars[i].end,f.cars[i].bogies],`car ${i} says where it is on the train and where its bogies are`));
 // the page-facing cars: position, turn, stretch and the turn of each bogie against the car
 good.cars.forEach((c,i)=>{const p=good.poses[i];assert.deepEqual([c.index,c.position,c.rotationY,c.scaleZ],[p.index,p.position,p.rotationY,p.scaleZ]);assert.equal(c.bogies.length,2);assert.deepEqual(c.bogies.map(b=>b.k),[0,1]);c.bogies.forEach(b=>assert.ok(Math.abs(b.rotationY)<.2,'a bogie is square to the track, near square to the car'));});
 // wrong placements
 const wrong=(change)=>safely(()=>C.curvePoses(f,curve,(g,v,l)=>change(carPoses(g,v,l))));
 const moved=wrong(poses=>{poses[2].frontBogie={...poses[2].frontBogie,point:[poses[2].frontBogie.point[0]+1,poses[2].frontBogie.point[1]]};return poses;});
 assert.equal(moved.ok,false);assert.match(moved.problems[0],/^carPoses puts bogie-2-0 at \(.*\), the route has it at \(.*\)$/);assert.ok(moved.maxErrorM>.9&&moved.maxErrorM<1.1);
 // the message says where it put the bogie and where the route has it: the two places, a metre apart
 {const [put,has]=/^carPoses puts bogie-2-0 at \((.*)\), the route has it at \((.*)\)$/.exec(moved.problems[0]).slice(1).map(t=>t.split(',').map(Number)),want=curve.placement.where(good.noseM-f.cars[2].bogies[0]);
  vec(has,want,1e-9,'where the route has it');near(Math.hypot(put[0]-has[0],put[1]-has[1]),1,F.CURVE.placementToleranceM,'a metre from it, where it was put (the page\'s curve and the route\'s points agree to the tolerance)');}
 const zMoved=wrong(poses=>{poses[2].frontBogie={...poses[2].frontBogie,point:[poses[2].frontBogie.point[0],poses[2].frontBogie.point[1]+1]};return poses;});assert.equal(zMoved.ok,false,'a bogie out along z');assert.ok(zMoved.maxErrorM>.9&&zMoved.maxErrorM<1.1);
 const notANumber=wrong(poses=>{poses[2].frontBogie={...poses[2].frontBogie,point:[NaN,0]};return poses;});assert.equal(notANumber.ok,false,'a bogie nowhere');assert.ok(notANumber.problems.some(t=>/^carPoses puts bogie-2-0 at /.test(t)),'and it is the bogie that is said to be wrong, not only the car it carries');
 const barely=wrong(poses=>{poses[1].rearBogie={...poses[1].rearBogie,point:[poses[1].rearBogie.point[0]+2e-5,poses[1].rearBogie.point[1]]};return poses;});assert.match(barely.problems[0],/bogie-1-1/,'20 micrometres is too far');
 const fine=wrong(poses=>{poses[1].rearBogie={...poses[1].rearBogie,point:[poses[1].rearBogie.point[0]+5e-6,poses[1].rearBogie.point[1]]};return poses;});assert.equal(fine.problems.filter(p=>/bogie-1-1/.test(p)).length,0,'5 micrometres is not');
 const turned=wrong(poses=>{poses[3].rotationY+=.001;return poses;});assert.equal(turned.ok,false);assert.match(turned.problems.at(-1),/^carPoses puts car-3 at .* turned .* and stretched .*, the chord between its bogies says/);
 const stretched=wrong(poses=>{poses[0].scaleZ*=1.01;return poses;});assert.match(stretched.problems[0],/car-0/);
 const shifted=wrong(poses=>{poses[2].position=[poses[2].position[0]+.01,poses[2].position[1]];return poses;});assert.match(shifted.problems[0],/car-2/);
 const alongShifted=wrong(poses=>{poses[2].position=[poses[2].position[0],poses[2].position[1]+.01];return poses;});assert.match(alongShifted.problems[0],/car-2/,'a car out along z');
 const wholeTurn=wrong(poses=>{poses[3].rotationY+=2*Math.PI;return poses;});assert.equal(wholeTurn.ok,true,'a whole turn more is the same turn');
 const nowhere=wrong(poses=>{poses[1].rotationY=NaN;return poses;});assert.equal(nowhere.ok,false,'a car turned by no number is not as the route has it');
 const slightlyTurned=wrong(poses=>{poses[3].rotationY+=5e-10;return poses;});assert.equal(slightlyTurned.ok,true,'a billionth of a radian is rounding');
 // and the plan of it is a GAP with the reason, not a throw
 const plan=safely(()=>C.planCurveFor(f,curve,(g,v,l)=>carPoses(g,v,l).map(p=>({...p,scaleZ:p.scaleZ*1.01}))));assert.equal(plan.status,'GAP');assert.match(plan.reason,/^the page's placement code \(carPoses\) disagrees with the geometry: carPoses puts car-0 at/);
 assert.equal(C.planCurveFor(f,curve).status,'OK');
 // a train too long for the route\'s edges is a problem of the route, not a throw
 // a train that pokes out of one end of the route, with the middle of the train on the tightest point, does not fit; a hair out is rounding
 const placed=apexM=>safely(()=>C.curvePoses(f,{...curve,placement:{...curve.placement,apexM}})),chainM=curve.placement.chain.lengthM;
 for(const [name,apexM] of [['the tail out of the start',f.length/2-1],['the nose out of the end',chainM-f.length/2+1]]){const out=placed(apexM);assert.equal(out.ok,false,name);assert.match(out.problems[0],/^a train .* m long with its middle on the tightest point does not fit the .* m of the route's edges$/,name);assert.equal(out.maxErrorM,null);}
 assert.equal(placed(f.length/2-5e-10).ok,true,'a tail a hair before the start');assert.equal(placed(chainM-f.length/2+5e-10).ok,true,'a nose a hair past the end');
 const tooLong=safely(()=>C.curvePoses({...f,length:curve.placement.chain.lengthM+50},curve));assert.equal(tooLong.ok,false);assert.equal(tooLong.maxErrorM,null);assert.match(tooLong.problems[0],/^a train .* m long with its middle on the tightest point does not fit the .* m of the route's edges$/);assert.deepEqual([tooLong.poses,tooLong.cars],[[],[]]);
 const short=safely(()=>C.planCurveFor({...f,length:curve.placement.chain.lengthM+50},curve));assert.equal(short.status,'GAP');assert.match(short.reason,/does not fit/);
});

// ---- the route of a run ----------------------------------------------------------------------------------------------------------------------------
check('the route of a run is read from a track file, for the longest kind whatever --kinds says, and the file is named by its hash; a track with no bend gets the synthetic arc',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(path.join(scratch,'train-curve-test-'));
 try {
  const write=async(name,data)=>{const file=path.join(dir,name),text=JSON.stringify(data);await writeFile(file,text);return {file,text};};
  const bend=arcWay({R:150,spacing:40,count:17,idBase:10,wayId:5}),a=await write('bend.json',bend),curve=await C.loadCurveRoute(a.file);
  const longest=Math.max(...ALL_KINDS.map(k=>trainLayout(k).length));
  assert.deepEqual(curve.longest,{kind:'gn387x12',lengthM:longest});assert.deepEqual(curve.trackData,{file:'kings-cross-src/web/src/data/kx-track.json',sha256:sha(Buffer.from(a.text))});
  // the same route the finder gives on the same data, on the curves of the page's graph
  const direct=find(bend,longest);assert.equal(curve.route.source,'real');assert.equal(curve.route.smooth,true);
  for(const key of ['radiusM','turnDeg','apex','apexS','lengthM','ways','tunnel','chain','searched','steps','points'])assert.deepEqual(curve.route[key],direct[key],key);
  assert.ok(curve.route.local&&curve.placement.chain.lengthM>longest+20);
  assert.equal(curve.placement.chain.graph.shapes instanceof Map,true,'the page\'s graph, with its curves');
  // the poses of the longest kind fit it
  assert.equal(C.curvePoses(C.describeFormation('gn387x12'),curve).ok,true);
  const straight=await write('straight.json',polyWay([[0,0],[0,-400],[0,-800]])),flat=await C.loadCurveRoute(straight.file);
  assert.equal(flat.route.source,'synthetic');near(flat.route.radiusM,100,1e-9);assert.equal(flat.placement.chain.graph.shapes,undefined);assert.equal(flat.longest.kind,'gn387x12');assert.equal(C.curvePoses(C.describeFormation('gn387x12'),flat).ok,true);
  await assert.rejects(C.loadCurveRoute(path.join(dir,'missing.json')),/ENOENT/);
 } finally {await rm(dir,{recursive:true,force:true});}
});

// ---- the page\'s own track ---------------------------------------------------------------------------------------------------------------------
/** The same joints computed another way: the cars placed by THREE nodes, the body footprints by brute force over every vertex and edge. */
const brute=(poses,f)=>{
 const spec_=spec(f.family),w=spec_.gangwayWidthM,half=spec_.half;
 const world=(pose,x,z)=>{const node=new T.Group();node.position.set(pose.position[0],0,pose.position[1]);node.rotation.y=pose.rotationY;node.scale.set(1,1,pose.scaleZ);node.updateMatrixWorld(true);const v=node.localToWorld(new T.Vector3(x,0,z));return [v.x,v.z];};
 const segDist=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
 const inside=(p,poly)=>{let neg=false,pos=false;for(let i=0;i<4;i++){const a=poly[i],b=poly[(i+1)%4],c=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);if(c<0)neg=true;if(c>0)pos=true;}return !(neg&&pos);};
 return poses.slice(0,-1).map((a,i)=>{
  const b=poses[i+1],rect=(pose)=>[[-half,pose.start+END_GAP],[half,pose.start+END_GAP],[half,pose.end-END_GAP],[-half,pose.end-END_GAP]].map(([x,z])=>world(pose,x,z)),P=rect(a),Q=rect(b);
  let m=Infinity;for(const [A,B] of [[P,Q],[Q,P]])for(const p of A)for(let k=0;k<4;k++)m=Math.min(m,segDist(p,B[k],B[(k+1)%4]));
  const gap=P.some(p=>inside(p,Q))||Q.some(p=>inside(p,P))?-m:m,d=x=>{const p=world(a,x,a.end),q=world(b,x,b.start);return Math.hypot(p[0]-q[0],p[1]-q[1]);};
  return {gap,coupler:d(0),left:d(-w/2),right:d(w/2)};
 });
};
check('the joints of every kind on an arc are what an independent computation gives (nodes placed by THREE, the gap by brute force), and no body ever intersects the next',()=>{
 for(const kind of ALL_KINDS) {
  const {f,placed}=arcPlaced(kind,70),joints=F.curveJoints(placed.poses,spec(f.family),{outsideSign:-1}),other=brute(placed.poses,f);
  assert.equal(joints.length,other.length);
  joints.forEach((j,i)=>{near(j.bodyGapM,other[i].gap,1e-9,`${kind} joint ${i} body gap`);near(j.coupler.distanceM,other[i].coupler,1e-9,`${kind} joint ${i} coupler`);near(j.gangway.left.distanceM,other[i].left,1e-9);near(j.gangway.right.distanceM,other[i].right,1e-9);});
 }
});

/** Each kind\'s joints on a curve against the numbers pinned for it, [tightest body gap, at which joint, widest coupler, at which joint, widest gangway, at which joint, its edge, findings, findings by check], and by the independent computation. */
const checkJoints=(curve,pose,pins)=>{
 assert.deepEqual(Object.keys(pins),ALL_KINDS);
 for(const kind of ALL_KINDS) {
  const f=formations.get(kind),plan=C.planCurveFor(f,curve,undefined,pose),c=plan.checks,[gap,gapAt,coupler,couplerAt,gangway,gangwayAt,edge,findings,byCheck]=pins[kind];
  assert.equal(plan.status,'OK',`${kind}: ${plan.reason}`);assert.equal(plan.id,pose.id);
  near(c.bodies.minGapM,gap,6e-7,`${kind} tightest body gap`);assert.equal(c.bodies.atJoint,gapAt);assert.equal(c.bodies.ok,true,`${kind}: no body touches the next`);
  near(c.couplers.maxDistanceM,coupler,6e-7,`${kind} widest coupler`);assert.equal(c.couplers.atJoint,couplerAt);near(c.gangways.maxDistanceM,gangway,6e-7,`${kind} widest gangway`);assert.equal(c.gangways.atJoint,gangwayAt);assert.equal(c.gangways.edge,edge);
  assert.equal(c.findings.length,findings,`${kind} findings`);const tally={};for(const x of c.findings)tally[x.check]=(tally[x.check]??0)+1;assert.deepEqual(tally,byCheck,`${kind} findings by check`);
  assert.equal(c.couplers.ok,!byCheck.coupler);assert.equal(c.gangways.ok,!byCheck.gangway);
  assert.equal(F.curveVerdict(plan).status,findings?'FINDING':'PASS');
  // the placement checks passed against the page\'s own carPoses
  assert.ok(C.curvePoses(f,curve).ok,`${kind}: carPoses puts every bogie on the curve`);
  // the same numbers by the independent computation
  const other=brute(C.curvePoses(f,curve).poses,f);plan.joints.forEach((j,i)=>{near(j.bodyGapM,other[i].gap,1e-9);near(j.coupler.distanceM,other[i].coupler,1e-9);near(j.gangway.right.distanceM,other[i].right,1e-9);});
 }
};
check('on the page\'s own track the tightest bend the longest train fits is 81.8 m, in a tunnel under the station, and each kind\'s joints on it are these numbers (pinned to this data; a change of the track data changes them)',async()=>{
 const curve=await C.loadCurveRoute(),route=curve.route;
 const bytes=await readFile(fileURLToPath(new URL('../../web/src/data/kx-track.json',import.meta.url)));
 assert.equal(curve.trackData.sha256,sha(bytes));
 assert.equal(curve.trackData.sha256,'ae5b95e46601e9f72d2bb8861138438fbf564c7b53dc96d16bce7481f71ba2a9','the track data changed: re-derive every number below, then update this pin');
 assert.deepEqual(curve.longest,{kind:'gn387x12',lengthM:244.67999999999995});
 assert.deepEqual([route.source,route.smooth,route.radiusM,route.turnDeg,route.baselineM],['real',true,81.807625,18.209675,26]);
 assert.deepEqual(route.apex,[-174.072165,25.852338]);assert.deepEqual(route.ways,[111564944,164434922]);assert.deepEqual(route.services,['main']);assert.deepEqual(route.tunnel,{apexInTunnel:true,windowM:264.68,fraction:1});
 assert.deepEqual([route.steps.length,route.points.length,route.lengthM,route.apexS],[13,168,376.428027,239.12465]);assert.deepEqual(route.apexAt,{step:6,share:.994912});
 assert.deepEqual(route.chain,{lengthM:1084.080884,nodes:45,from:[-299.3,-316.8],to:[469.8,184.8]});assert.deepEqual(route.searched,{chains:209,pieces:210,fitting:69});
 assert.deepEqual([route.local.insideSign,route.local.outsideSign,route.local.headingDeg],[-1,1,122.862958]);
 // every node of the route\'s edges is on the page\'s drawn curve, and the route is that curve: a bogie placed by the page lies on it
 const graph=buildGraph(JSON.parse(bytes.toString('utf8')),{curves:true});
 for(const s of route.steps){const e=graph.adj.get(s.from).find(x=>x.wayId===s.way&&(x.a===s.to||x.b===s.to));const pts=shapeFrom(graph.shapes,s.from,s.to);assert.equal(pts.length,s.toIndex-s.fromIndex+1,'the edge is its curve\'s points');pts.forEach((p,k)=>vec(route.points[s.fromIndex+k],p,6e-7));assert.ok(e);}
 near(curve.placement.apexM,239.056752,1e-6);near(curve.placement.chain.lengthM,376.293379,1e-6);
 const pins={
  lner5:[.511717,2,.605581,1,.649089,1,'right',7,{coupler:2,gangway:5}],lner9:[.506372,7,.605581,3,.649089,3,'right',7,{coupler:2,gangway:5}],hull5:[.511717,2,.605581,1,.649089,1,'right',7,{coupler:2,gangway:5}],lumo5:[.511717,2,.605581,1,.649089,1,'right',7,{coupler:2,gangway:5}],
  gn387x4:[.373719,1,.153676,2,.311825,1,'right',0,{}],gn387x8:[.373719,3,.153676,4,.311825,3,'right',0,{}],gn387x12:[.373719,5,.171946,10,.311825,5,'right',0,{}],gn717x6:[.373727,2,.148899,3,.383738,2,'right',1,{gangway:1}],
  gc180x5:[.501641,2,.490887,1,.520994,1,'right',6,{coupler:2,gangway:4}],tl700x8:[.374182,3,.144755,4,.383025,3,'right',1,{gangway:1}],tl700x12:[.374182,5,.144755,6,.383025,5,'right',1,{gangway:1}],
 };
 checkJoints(curve,F.CURVE,pins);
});

check('the route of a C02 run is read from a track file the same way, with the typical radius found on it beside the route, and a track with no bend to take one from is refused',async()=>{
 const scratch=fileURLToPath(new URL('../../../.scratch/',import.meta.url));await mkdir(scratch,{recursive:true});const dir=await mkdtemp(path.join(scratch,'train-curve-test-'));
 try {
  const write=async(name,data)=>{const file=path.join(dir,name),text=JSON.stringify(data);await writeFile(file,text);return {file,text};};
  const bend=arcWay({R:150,spacing:30,count:41,idBase:10,wayId:5}),a=await write('bend.json',bend),normal=await C.loadCurveRoute(a.file,{typical:true}),tight=await C.loadCurveRoute(a.file);
  const longest=Math.max(...ALL_KINDS.map(k=>trainLayout(k).length)),graph=buildGraph(bend,{curves:true}),long=C.describeFormation('gn387x12');
  assert.equal('typical' in tight,false,'the tightest bend has no typical radius');assert.equal(tight.route.pick,undefined);
  // the radius is the finder\'s on the curves of the page\'s graph, and the route is the bend nearest it
  const want=F.typicalRadius(bend,{shapeOf:(x,y)=>shapeFrom(graph.shapes,x,y)});assert.deepEqual(normal.typical,want);assert.ok(Math.abs(normal.typical.radiusM-150)<.05*150,`${normal.typical.radiusM}`);
  assert.equal(normal.route.source,'real');assert.deepEqual([normal.route.pick.kind,normal.route.pick.typicalRadiusM],['typical',want.radiusM]);assert.equal(normal.route.smooth,true);
  assert.deepEqual(normal.longest,{kind:'gn387x12',lengthM:longest});assert.deepEqual(normal.trackData,tight.trackData);assert.equal(normal.trackData.sha256,sha(Buffer.from(a.text)));
  assert.equal(C.curvePoses(long,normal).ok,true,'the poses of the longest kind fit it');
  const plan=C.planCurveFor(long,normal,undefined,F.CURVE_NORMAL);assert.equal(plan.status,'OK');assert.deepEqual([plan.id,plan.suffix,plan.route.pick.kind],['C02','curve-normal','typical']);
  // a track that bends, but nowhere the longest train fits on a bend in the band, is the arc of the typical radius, with the radius still returned
  const shorter=await write('short.json',arcWay({R:150,spacing:30,count:6,idBase:10,wayId:5})),arc=await C.loadCurveRoute(shorter.file,{typical:true});
  assert.equal(arc.route.source,'synthetic');near(arc.route.radiusM,arc.typical.radiusM,1e-9);assert.ok(Math.abs(arc.typical.radiusM-150)<.05*150);assert.match(arc.route.note,/on a bend within 10% of the typical radius$/);assert.equal(C.curvePoses(long,arc).ok,true);
  // a track that does not bend has no radius to take: refused, where the tightest bend\'s falls back to its arc
  const straight=await write('straight.json',polyWay([[0,0],[0,-400],[0,-800]]));
  await assert.rejects(C.loadCurveRoute(straight.file,{typical:true}),/the page's track has no bend to take a typical radius from/);assert.equal((await C.loadCurveRoute(straight.file)).route.source,'synthetic');
 } finally {await rm(dir,{recursive:true,force:true});}
});

check('on the page\'s own track the radius that is typical of a bend is 451.9 m, the bend nearest it is on the surface at 474.8 m, and each kind\'s joints on it are these numbers (pinned to this data; a change of the track data changes them)',async()=>{
 const curve=await C.loadCurveRoute(undefined,{typical:true}),route=curve.route,{typical}=curve;
 const bytes=await readFile(fileURLToPath(new URL('../../web/src/data/kx-track.json',import.meta.url)));
 assert.equal(curve.trackData.sha256,sha(bytes));
 assert.equal(curve.trackData.sha256,'ae5b95e46601e9f72d2bb8861138438fbf564c7b53dc96d16bce7481f71ba2a9','the track data changed: re-derive every number below, then update this pin');
 assert.deepEqual(curve.longest,{kind:'gn387x12',lengthM:244.67999999999995});
 // the radius: the median of the 13,859 m of bend on the 40,627 m of main line the track has, in its 210 pieces, a quarter of it tighter than 277 m and a quarter wider than 774 m
 assert.deepEqual(typical,{radiusM:451.89688,baselineM:26,bendMinDeg:1,services:['main'],stepM:.5,trackM:40627,bendM:13859,quartilesM:[277.370828,774.190879],pieces:210});
 // the bend: on the surface (no tunnel in its window), three ways, within the band of that radius, under a train that is on a bend of about that radius along its length and straight for 9 m of it
 assert.deepEqual([route.source,route.smooth,route.radiusM,route.turnDeg,route.baselineM],['real',true,474.836107,3.137273,26]);
 assert.deepEqual(route.apex,[-110.735902,-1135.891177]);assert.deepEqual(route.ways,[22758713,22597498,4480807]);assert.deepEqual(route.services,['main']);assert.deepEqual(route.tunnel,{apexInTunnel:false,windowM:0,fraction:0});
 assert.deepEqual([route.steps.length,route.points.length,route.lengthM,route.apexS],[12,67,297.773371,142.927318]);assert.deepEqual(route.apexAt,{step:6,share:.330004});
 assert.deepEqual(route.chain,{lengthM:1498.444024,nodes:35,from:[-535.2,-1148.8],to:[891,-1517.2]});assert.deepEqual(route.searched,{chains:209,pieces:210,fitting:69});
 assert.deepEqual(route.pick,{kind:'typical',typicalRadiusM:451.89688,bandShare:.1,meanDeviation:.289293,tightestM:334.907162,straightM:9});
 assert.deepEqual([route.local.insideSign,route.local.outsideSign,route.local.headingDeg],[-1,1,80.781862]);
 assert.ok(Math.abs(route.radiusM/typical.radiusM-1)<=.1,'the bend is within the band of the typical radius');
 const circle=circumradius(route);assert.ok(Math.abs(route.radiusM-circle)<.05*circle,`the radius is the drawn curve\'s: ${route.radiusM}, and three points of it say ${circle}`);
 // every node of the route\'s edges is on the page\'s drawn curve, and the route is that curve
 const graph=buildGraph(JSON.parse(bytes.toString('utf8')),{curves:true});
 for(const s of route.steps){const e=graph.adj.get(s.from).find(x=>x.wayId===s.way&&(x.a===s.to||x.b===s.to));const pts=shapeFrom(graph.shapes,s.from,s.to);assert.equal(pts.length,s.toIndex-s.fromIndex+1,'the edge is its curve\'s points');pts.forEach((p,k)=>vec(route.points[s.fromIndex+k],p,6e-7));assert.ok(e);}
 near(curve.placement.apexM,142.918748,1e-6);near(curve.placement.chain.lengthM,297.75361,1e-6);
 // each kind: no joint fails, which is the point of a typical bend (the tightest one fails on 8 of 11)
 checkJoints(curve,F.CURVE_NORMAL,{
  lner5:[.611582,2,.069734,0,.090039,2,'right',0,{}],lner9:[.611582,4,.126106,1,.13354,1,'right',0,{}],hull5:[.611582,2,.071655,0,.090039,2,'right',0,{}],lumo5:[.611582,2,.069734,0,.090039,2,'right',0,{}],
  gn387x4:[.633792,2,.054989,1,.07132,2,'right',0,{}],gn387x8:[.633792,4,.054989,3,.07132,4,'right',0,{}],gn387x12:[.62036,1,.054989,5,.075675,1,'right',0,{}],gn717x6:[.633718,3,.053555,2,.080444,3,'right',0,{}],
  gc180x5:[.615086,2,.041458,0,.065464,2,'right',0,{}],tl700x8:[.633798,4,.052826,2,.080851,4,'right',0,{}],tl700x12:[.618932,1,.052826,4,.080851,6,'right',0,{}],
 });
});

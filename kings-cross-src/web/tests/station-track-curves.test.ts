// Waverley's track drawn and graphed on the same faired curves (station-railway.ts stationTrackCurves, railRibbon, addTrackLines).
// Synthetic fixtures only: an S-bend, and a junction whose through track runs on into a tunnel (graphed, not drawn).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import {buildGraph, edgePoint} from '../../core/graph.ts';
import type {Graph} from '../../core/graph.ts';
import {waverleyTrackData} from '../../core/waverley-anchors.ts';
import {terrainFromFunction} from '../../core/terrain.ts';
import {Batch} from '../src/materials.ts';
import {SLEEPER_SPACING, railRibbon, segmentDistance, stationTrackCurves, stationTrackData} from '../src/station-railway.ts';
import {WAVERLEY_LEVELS, buildWaverleyScene} from '../src/waverley-scene.ts';

const scene=(rails:WaverleyData['rails']):WaverleyData=>({origin:{lat:55.9519018,lon:-3.1904199},bbox:[55.9465,-3.205,55.9575,-3.173],attribution:'synthetic',source:{url:'synthetic',fetchedAt:'2026-01-01',sha256:'synthetic',license:'ODbL',query:'synthetic'},rails,platforms:[],roofs:[],buildings:[],warnings:[]});
const rail=(id:string,path:Pt[],tags:Record<string,string>={}):WaverleyData['rails'][number]=>({id,path,tags:{railway:'rail',...tags}});
/** An S-bend: one wavelength of a 6 m sine over 240 m, a node every 15 m (a reverse curve of about 240 m radius). */
const sBend=():WaverleyData=>scene([rail('way/10',Array.from({length:17},(_,i):Pt=>[i*15,6*Math.sin(2*Math.PI*i*15/240)]))]);
/** A junction: a through track, a turnout peeling off it at x=100, and the through track running on into a tunnel at x=0. */
const junction=():WaverleyData=>scene([
 rail('way/20',Array.from({length:13},(_,i):Pt=>[i*20,40])),
 rail('way/21',[[100,40],[130,41.5],[160,46],[190,53]]),
 rail('way/22',[[-30,40],[0,40]],{tunnel:'yes'}),
]);
const FIXTURES={'S-bend':sBend,junction};
/** The live graph exactly as edinburgh-live.ts createEdinburghMotion builds it. */
const liveGraph=(d:WaverleyData):Graph=>buildGraph(waverleyTrackData(d),{curves:true});
const distanceTo=(p:Pt,line:readonly Pt[]):number=>{let m=Infinity;for(let i=1;i<line.length;i++)m=Math.min(m,segmentDistance(p[0],p[1],[...line[i-1],...line[i]]));return m;};
/** Each drawn edge's curve read off the graph by edgePoint, densely (every ~2 cm). */
function graphCurves(g:Graph):Pt[][] {
 return g.edges.filter(e=>!e.tunnel).map(e=>{const n=Math.ceil(e.length/.02);return Array.from({length:n+1},(_,k)=>edgePoint(g,e,k/n).point);});
}
const nearest=(p:Pt,curves:readonly Pt[][])=>Math.min(...curves.map(c=>distanceTo(p,c)));
const CM=.01;

test('stationTrackData is the live graph\'s data: waverleyTrackData\'s nodes and rails, in any rail order',()=>{
 for(const make of Object.values(FIXTURES)){
  const d=make(),{nodes,rails}=waverleyTrackData(d);
  assert.deepEqual(stationTrackData(d),{nodes,rails});
  assert.deepEqual(stationTrackData({rails:[...d.rails].reverse()}),{nodes,rails});
 }
});

test('the drawn ribbons lie on the graph\'s shapePoint curves within 1 cm (an S-bend, a junction)',()=>{
 for(const [name,make]of Object.entries(FIXTURES)){
  const d=make(),curves=graphCurves(liveGraph(d)),lines=stationTrackCurves(d),half=WAVERLEY_LEVELS.ballastHalfWidth;
  assert.ok(lines.some(l=>l.length>2),`${name}: the track is drawn on curves, not chords`);
  for(const line of lines){
   const own=curves.filter(c=>Math.hypot(c[0][0]-line[0][0],c[0][1]-line[0][1])<CM&&Math.hypot(c.at(-1)![0]-line.at(-1)![0],c.at(-1)![1]-line.at(-1)![1])<CM||Math.hypot(c[0][0]-line.at(-1)![0],c[0][1]-line.at(-1)![1])<CM&&Math.hypot(c.at(-1)![0]-line[0][0],c.at(-1)![1]-line[0][1])<CM);
   assert.equal(own.length,1,`${name}: each drawn line is one graph edge`);
   const batch=new Batch();railRibbon(batch,line,half,0);const g=batch.build(),p=g.getAttribute('position');
   assert.equal(p.count,4*(line.length-1),`${name}: a quad per piece`);
   let worstEdge=0,worstMid=0;
   for(let q=0;q<p.count;q+=4){
    let cx=0,cz=0;
    for(let k=q;k<q+4;k++){const v:Pt=[p.getX(k),p.getZ(k)];cx+=v[0]/4;cz+=v[1]/4;worstEdge=Math.max(worstEdge,Math.abs(distanceTo(v,own[0])-half));}
    worstMid=Math.max(worstMid,distanceTo([cx,cz],own[0]));
   }
   g.dispose();
   assert.ok(worstEdge<CM,`${name}: every ribbon vertex stands the half width off the curve (worst ${worstEdge.toFixed(4)} m off)`);
   assert.ok(worstMid<CM,`${name}: every quad is centred on the curve (worst ${worstMid.toFixed(4)} m)`);
  }
 }
});

test('the graph\'s edgePoint matches the drawn centre line, including where the junction\'s tunnel shapes it',()=>{
 for(const [name,make]of Object.entries(FIXTURES)){
  const d=make(),g=liveGraph(d),lines=stationTrackCurves(d);
  assert.equal(lines.length,g.edges.filter(e=>!e.tunnel).length,`${name}: every surface edge is drawn once, no tunnel edge`);
  let worst=0,count=0;
  for(const e of g.edges)for(let k=0;k<=200;k++){const {point}=edgePoint(g,e,k/200),d0=nearest(point,lines);if(!e.tunnel){worst=Math.max(worst,d0);count++;}}
  assert.ok(count>0);
  assert.ok(worst<CM,`${name}: a train read off the graph is on the drawn centre line (worst ${worst.toFixed(4)} m)`);
 }
});

test('the sleepers are placed by arc length on the curve, and their count is stable',()=>{
 const counts:Record<string,number>={};
 for(const [name,make]of Object.entries(FIXTURES)){
  const terrain=terrainFromFunction(()=>-.2,{x0:-64,z0:-64,x1:320,z1:128},8);
  const built=(d:WaverleyData)=>{
   const w=buildWaverleyScene({data:d,terrain,lighting:false}),m=w.parts.track.getObjectByName('waverley-sleepers') as THREE.InstancedMesh,out:Pt[]=[];
   const matrix=new THREE.Matrix4(),v=new THREE.Vector3();for(let i=0;i<m.count;i++){m.getMatrixAt(i,matrix);v.setFromMatrixPosition(matrix);out.push([v.x,v.z]);}
   const sleepers=w.stats.sleepers;w.dispose();return {sleepers,at:out};
  };
  const d=make(),a=built(d),b=built({...d,rails:[...d.rails].reverse()}),lines=stationTrackCurves(d);
  const arc=(l:readonly Pt[])=>l.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-l[i][0],p[1]-l[i][1]),0);
  const expected=lines.reduce((s,l)=>s+Math.max(0,Math.ceil((arc(l)-SLEEPER_SPACING/2)/SLEEPER_SPACING)),0);
  assert.equal(a.sleepers,expected,`${name}: one sleeper every ${SLEEPER_SPACING} m of arc on each drawn edge`);
  assert.equal(b.sleepers,a.sleepers,`${name}: the count does not depend on the rail order`);
  assert.ok(a.at.every(p=>nearest(p,lines)<CM),`${name}: every sleeper sits on the centre line`);
  counts[name]=a.sleepers;
 }
 // Pinned: the fixtures' arc lengths over the spacing. A change here is a change to the sleeper rule or the curves.
 assert.deepEqual(counts,{'S-bend':368,junction:512});
});

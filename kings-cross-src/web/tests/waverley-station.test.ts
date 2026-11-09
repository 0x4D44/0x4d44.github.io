import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import dataFile from '../src/data/waverley-scene.json' with {type:'json'};
import {buildWaverleyStation,WAVERLEY_STATION_OMIT_IDS,WAVERLEY_STATION_ROOF_ID} from '../src/waverley-station.ts';
import {waverleyRailPieces,waverleyStationPlan,waverleyStructureBatches,WAVERLEY_EDGE_BANDS,WAVERLEY_STRUCTURE} from '../src/waverley-station-structure.ts';
import {centralBlockBatches,WAVERLEY_BLOCK,WAVERLEY_CENTRAL_BLOCK_ID} from '../src/waverley-station-block.ts';
import {ridgeRoofBatches,roofHeight,WAVERLEY_ROOF_BANDS,WAVERLEY_ROOF_PROFILE,WAVERLEY_ROOF_STRIP_LIFT} from '../src/waverley-roof.ts';
import {WAVERLEY_LEVELS} from '../src/waverley-mesh.ts';

const data=unpackWaverleyScene(dataFile as never),roof=data.roofs.find(r=>r.id===WAVERLEY_STATION_ROOF_ID)!,plan=waverleyStationPlan(data,roof),tracks=waverleyRailPieces(data);
const flat={rangeUnder:()=>({min:WAVERLEY_LEVELS.ground,max:WAVERLEY_LEVELS.ground,mean:WAVERLEY_LEVELS.ground})};
/** A train's half-width from the track centre line, metres: the KX figure for a platform face (furniture.ts FIGURES.trackProbe), ASSUMED. */
const ENVELOPE_HALF=1.7;
/** The top of a train and its overhead wires above the rail, metres. ASSUMED (a W6a vehicle is under 4 m; contact wire about 4.7 m). */
const ENVELOPE_TOP=4.8;
const segDist=(p:Pt,[a,b]:[Pt,Pt]):number=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
const trackDist=(p:Pt):number=>Math.min(...tracks.map(s=>segDist(p,s)));
const inRing=(p:Pt,r:readonly Pt[]):boolean=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;};
const onPlatform=(p:Pt):boolean=>data.platforms.some(q=>inRing(p,q.path));

test('W1 columns stand on platforms, under the roof, at about the roof pitch, clear of every train',()=>{
 const S=WAVERLEY_STRUCTURE;
 assert.ok(plan.columns.length>=100,`${plan.columns.length} columns`);
 for(const c of plan.columns){
  const p:Pt=[c.x,c.z];
  assert.ok(onPlatform(p),`column at ${p} stands on a platform`);
  assert.ok(trackDist(p)>=ENVELOPE_HALF+S.capitalRadius,`column at ${p} is ${trackDist(p).toFixed(2)} m from a track`);
  assert.ok(inRing(p,roof.outer)&&!roof.holes.some(h=>inRing(p,h)),'under the roof, not in the central block');
 }
 // Platform girders join neighbouring columns: about one roof pitch apart, never a jump over a missing column.
 for(const [a,b]of plan.spans){const l=Math.hypot(b[0]-a[0],b[1]-a[1]);assert.ok(l>WAVERLEY_ROOF_PROFILE.pitch*.5&&l<=S.maxSpan,`span ${l.toFixed(1)} m`);}
});

test('W1 furniture keeps out of the train envelope and stays on its platform',()=>{
 const S=WAVERLEY_STRUCTURE;
 for(const [list,half]of [[plan.benches,S.benchLength/2],[plan.screens,S.screenWidth/2],[plan.signs,S.signSize/2],[plan.lamps,S.lampRadius]] as const)for(const s of list){
  const p:Pt=[s.x,s.z];assert.ok(onPlatform(p),`item at ${p} on a platform`);assert.ok(trackDist(p)>=ENVELOPE_HALF+half,`item at ${p} is ${trackDist(p).toFixed(2)} m from a track (needs ${ENVELOPE_HALF+half})`);
 }
 assert.ok(plan.benches.length>20&&plan.signs.length>20&&plan.screens.length>20&&plan.lamps.length>100);
});

test('W1 ironwork: under the glazing, above every train, and no chord coplanar with another',()=>{
 const {ironwork}=waverleyStructureBatches(plan),S=WAVERLEY_STRUCTURE,holes=plan.holes;
 const nearHole=(p:Pt):boolean=>holes.some(h=>h.some((a,i)=>segDist(p,[a,h[(i+1)%h.length]])<.01));
 let over=0;
 for(let i=0;i<ironwork.positions.length;i+=3){
  const x=ironwork.positions[i],y=ironwork.positions[i+1],z=ironwork.positions[i+2],p:Pt=[x,z];
  assert.ok(y<=roofHeight(x)+1e-6,`ironwork at ${p} y ${y} is above the glazing`);
  if(y>S.gutterGirderTop+1e-6)assert.ok(nearHole(p),'only the valance rises above the girders, at the hole');
  if(trackDist(p)<ENVELOPE_HALF){over++;assert.ok(y>=ENVELOPE_TOP,`ironwork over a track at ${p} is ${y.toFixed(2)} m up`);}
 }
 assert.ok(over>1000,'girders do span the tracks');
 assert.ok(S.gutterGirderTop<WAVERLEY_ROOF_PROFILE.gutter,'gutter girders stay under the gutter');
 const chords=[S.gutterGirderTop,S.gutterGirderTop-S.chordDepth,S.gutterGirderTop-S.gutterGirderDepth,S.gutterGirderTop-S.gutterGirderDepth+S.chordDepth];
 const other=[S.platformGirderTop,S.platformGirderTop-S.chordDepth,S.platformGirderTop-S.platformGirderDepth,S.platformGirderTop-S.platformGirderDepth+S.chordDepth];
 for(const a of chords)for(const b of other)assert.ok(Math.abs(a-b)>=.04,`chord faces at ${a} and ${b} are too close`);
 assert.ok(S.valanceBottom>data.buildings.find(b=>b.id===WAVERLEY_CENTRAL_BLOCK_ID)!.height+.04+.3,'the valance clears the block and its cornice');
});

test('W1 columns: pedestal, shaft and capital fill the platform-to-girder height',()=>{
 const S=WAVERLEY_STRUCTURE,{fittings}=waverleyStructureBatches({...plan,signs:[],screens:[],benches:[],columns:plan.columns.slice(0,1)});
 const ys=fittings.positions.filter((_,i)=>i%3===1);
 assert.ok(Math.abs(Math.min(...ys)-WAVERLEY_LEVELS.platform)<1e-6);
 assert.ok(Math.abs(Math.max(...ys)-(S.platformGirderTop-S.platformGirderDepth))<1e-6,'the abacus carries the platform girder');
});

test('W1 roof: the solid gutter and ridge strips are a fixed share of each pitch, just over the glazing',()=>{
 const outer:Pt[]=[[0,0],[36,0],[36,24],[0,24]],{solid}=ridgeRoofBatches(outer,[]);
 let area=0;
 for(let i=0;i<solid.indices.length;i+=3){const [a,b,c]=solid.indices.slice(i,i+3).map(n=>solid.positions.slice(n*3,n*3+3));area+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;}
 const share=2*(WAVERLEY_ROOF_BANDS.gutter+WAVERLEY_ROOF_BANDS.ridge)/WAVERLEY_ROOF_PROFILE.pitch;
 assert.ok(Math.abs(area-36*24*share)<1e-6,`solid ${area} m2`);
 for(let i=0;i<solid.positions.length;i+=3)assert.ok(Math.abs(solid.positions[i+1]-roofHeight(solid.positions[i])-WAVERLEY_ROOF_STRIP_LIFT)<1e-6);
});

test('W1 platform edge bands lie on their platforms, along track edges only',()=>{
 const {edges}=waverleyStructureBatches(plan);assert.ok(edges.triangles>200);
 for(let i=0;i<edges.indices.length;i+=3){
  const vs=edges.indices.slice(i,i+3).map(n=>edges.positions.slice(n*3,n*3+3)),c:Pt=[(vs[0][0]+vs[1][0]+vs[2][0])/3,(vs[0][2]+vs[1][2]+vs[2][2])/3];
  assert.ok(onPlatform(c),`edge band at ${c}`);assert.ok(vs.every(v=>Math.abs(v[1]-WAVERLEY_LEVELS.platform-WAVERLEY_STRUCTURE.stripLift)<1e-9));
 }
 assert.equal(WAVERLEY_EDGE_BANDS[1].to-WAVERLEY_EDGE_BANDS[1].from,.4,'the DfT 400 mm warning strip');
});

test('W1 draws the central block itself: the mapped block leaves the city loop and the replacement covers its footprint',async()=>{
 assert.deepEqual([...WAVERLEY_STATION_OMIT_IDS],[WAVERLEY_CENTRAL_BLOCK_ID]);
 const {buildWaverleyScene}=await import('../src/waverley-scene.ts');const scene=buildWaverleyScene({lighting:false});
 assert.ok(!scene.buildingIds.includes(WAVERLEY_CENTRAL_BLOCK_ID),'the generic block is not drawn');
 const block=data.buildings.find(b=>b.id===WAVERLEY_CENTRAL_BLOCK_ID)!,top=scene.parts.platforms.getObjectByName('waverley-central-block-top') as THREE.Mesh;
 assert.ok(top,'the replacement is drawn');scene.group.updateMatrixWorld(true);
 const xs=block.outer.map(p=>p[0]),zs=block.outer.map(p=>p[1]);let hits=0,inside=0;
 for(let x=Math.min(...xs);x<=Math.max(...xs);x+=3)for(let z=Math.min(...zs);z<=Math.max(...zs);z+=3){
  if(!inRing([x,z],block.outer))continue;inside++;
  const h=new THREE.Raycaster(new THREE.Vector3(x,50,z),new THREE.Vector3(0,-1,0)).intersectObject(top);
  if(h.length&&Math.abs(h[0].point.y-(scene.terrain.rangeUnder(block.outer,4).min+block.height))<1e-3)hits++;
 }
 assert.ok(inside>100);assert.equal(hits,inside,'every point of the footprint is roofed by the block at its height');
 scene.dispose();
});

test('W1 central block: windows sit on the walls between plinth and cornice, never coplanar with them',()=>{
 const block=data.buildings.find(b=>b.id===WAVERLEY_CENTRAL_BLOCK_ID)!,{windows,stone}=centralBlockBatches(block,0);
 assert.ok(windows.triangles>=40&&stone.triangles>100);
 const ys=windows.positions.filter((_,i)=>i%3===1);assert.ok(Math.max(...ys)<=block.height-WAVERLEY_BLOCK.cornice,'windows stop under the cornice');
 assert.ok(WAVERLEY_BLOCK.windowLift>0&&WAVERLEY_BLOCK.doorLift>WAVERLEY_BLOCK.plinthDepth,'a door stands clear of the plinth in front of it');
});

test('W1 station: every part is counted, and dispose frees the owned materials',()=>{
 const s=buildWaverleyStation(data,flat);let tris=0,draws=0;
 for(const g of [s.platforms,s.roof])g.traverse(o=>{if(o instanceof THREE.Mesh){tris+=o.geometry.index!.count/3;draws++;}});
 assert.equal(s.stats.triangles,tris);assert.equal(s.stats.drawCalls,draws);
 assert.ok(s.stats.triangles<240000,`${s.stats.triangles} triangles`);assert.ok(s.stats.drawCalls<=6+24);
 const m=(s.roof.getObjectByName('waverley-roof-ironwork') as THREE.Mesh).material as THREE.Material;let freed=0;m.addEventListener('dispose',()=>freed++);
 s.dispose();assert.equal(freed,1);
});

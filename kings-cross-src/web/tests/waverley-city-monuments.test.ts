// W3 city, round 2: the cutaway gate over the new city parts, trees seated on slopes, the tiered Scott spire, the Nelson and National
// Monuments and the Castle walls (web/src/waverley-city*.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {LANDUSE,Footprints,placeTrees,slopeOf,crownDepth,SCRUB_MAX_SLOPE_DEG,FILL_STEP} from '../src/waverley-city-ground.ts';
import {castleWalls,castleWallSection,walkSlopeDeg,BATTLEMENT,NATIONAL_COLUMNS,MONUMENT_OMIT_IDS,NELSON,CASTLE_WALL} from '../src/waverley-city-monuments.ts';
import {buildWaverleyCityLandmarks,WAVERLEY_CITY_STONE,WAVERLEY_CITY_ASHLAR,SCOTT_STONE,MONUMENT_STONE} from '../src/waverley-city.ts';
import {Batch,TEXTURES,CITY_TEXTURES} from '../src/materials.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import sceneFile from '../src/data/waverley-scene.json' with {type:'json'};

const data=unpackWaverleyScene(sceneFile);
const scene=buildWaverleyScene({lighting:false});
test.after(()=>scene.dispose());

test('cityVisible:false hides the ground cover, the trees and the monuments with the rest of the city (the cutaway gate)',()=>{
 const hidden=buildWaverleyScene({lighting:false,cityVisible:false});
 try{
  for(const n of ['waverley-ground-cover','waverley-tree-crowns','waverley-wood-crowns','waverley-tree-trunks','waverley-city-monuments','waverley-scott-monument','waverley-building-walls']){
   const o=hidden.group.getObjectByName(n);assert.ok(o,n);let shown=true;for(let p:THREE.Object3D|null=o!;p;p=p.parent)shown&&=p.visible;assert.equal(shown,false,`${n} hidden`);}
 }finally{hidden.dispose();}
});

test('trees sit on the slope: no fill on crags over SCRUB_MAX_SLOPE_DEG, and no ground rises into any crown',()=>{
 const fp=new Footprints([...data.buildings,...data.roofs].map(b=>b.outer)),trees=placeTrees(scene.terrain,fp);
 let worst=-Infinity,at='';
 for(const t of trees){
  if(t.kind!=='tree')assert.ok(slopeOf(scene.terrain,t.x,t.z)<=SCRUB_MAX_SLOPE_DEG,'no fill on the crag');
  const ch=crownDepth(t.kind)*t.height,cy=t.y+t.height-ch;
  for(let k=0;k<12;k++){const a=k*Math.PI/6;for(const f of [.6,1]){const g=scene.terrain.heightAt(t.x+Math.cos(a)*t.crown*f,t.z+Math.sin(a)*t.crown*f);
   // the crown's underside at fraction f of its radius is cy - ch*sqrt(1-f^2)
   const d=g-(cy-ch*Math.sqrt(1-f*f));if(d>worst){worst=d;at=`${t.kind} at ${t.x.toFixed(0)},${t.z.toFixed(0)}`;}}}
 }
 assert.ok(worst<.25,`ground rises ${worst.toFixed(2)} m into a crown (${at})`);
 assert.ok(trees.filter(t=>t.kind==='wood').some(t=>t.crown*2>FILL_STEP.wood),'woodland crowns overlap into a canopy');
});

test('the Scott spire steps in at its tiers to the OSM 61.11 m; Nelson is a 32 m castellated tower with its mast; 12 National columns',()=>{
 const g={heightAt:()=>0,rangeUnder:()=>({min:0,max:0,mean:0})},built=buildWaverleyCityLandmarks(g);
 try{
  const scott=built.group.getObjectByName('waverley-scott-monument') as THREE.Mesh,p=scott.geometry.getAttribute('position');
  const spread=(y0:number,y1:number)=>{let r=0;for(let i=0;i<p.count;i++){const y=p.getY(i);if(y>y0&&y<y1)r=Math.max(r,Math.hypot(p.getX(i)+177,p.getZ(i)+51));}return r;};
  scott.geometry.computeBoundingBox();assert.ok(Math.abs(scott.geometry.boundingBox!.max.y-61.11)<1e-6,'still the OSM 61.11 m');
  assert.ok(spread(39.5,45)<spread(30,37)&&spread(47,51)<spread(39.5,45),'each tier narrower than the one below');
  const m=built.group.getObjectByName('waverley-city-monuments') as THREE.Mesh,q=m.geometry.getAttribute('position');
  const top=(x:number,z:number,r:number,below=Infinity)=>{let t=-Infinity;for(let i=0;i<q.count;i++)if(Math.hypot(q.getX(i)-x,q.getZ(i)-z)<r&&q.getY(i)<below)t=Math.max(t,q.getY(i));return t;};
  const nelson=data.buildings.find(b=>b.id===NELSON.tower)!,c=nelson.outer.reduce((a,v)=>[a[0]+v[0]/nelson.outer.length,a[1]+v[1]/nelson.outer.length],[0,0]);
  assert.ok(Math.abs(top(c[0],c[1],3,32.5)-32)<1e-6,'Nelson: its battlements end at the OSM 32 m');
  assert.ok(top(c[0],c[1],1)>36,'the mast and time ball above');
  let merlonTops=0;for(let i=0;i<q.count;i++){const d=Math.hypot(q.getX(i)-c[0],q.getZ(i)-c[1]);if(d>1.2&&d<2.2&&Math.abs(q.getY(i)-32)<1e-6)merlonTops++;}
  assert.ok(merlonTops>=12*4,'a ring of merlons on the sixth stage');
  let shafts=0;for(const id of NATIONAL_COLUMNS){const b=data.buildings.find(x=>x.id===id)!,k=b.outer.reduce((a,v)=>[a[0]+v[0]/b.outer.length,a[1]+v[1]/b.outer.length],[0,0]);
   let round=0;for(let i=0;i<q.count;i++){const y=q.getY(i),d=Math.hypot(q.getX(i)-k[0],q.getZ(i)-k[1]);if(d<1.2&&y>3&&y<13)round++;}if(round>=32)shafts++;}
  assert.equal(shafts,12,'twelve round shafts on their OSM parts');
  for(const id of MONUMENT_OMIT_IDS)assert.ok(!scene.buildingIds.includes(id),`${id} is drawn by its monument, not the fabric`);
  assert.ok(BATTLEMENT.merlon>0);
 }finally{built.dispose();}
});

test('the Castle walls follow their OSM lines on Castle Rock, battlemented, with no part left floating',()=>{
 assert.ok(LANDUSE.castleWalls.length>=20&&LANDUSE.castleWalls.filter(w=>w.curtain).length>=8,'the mapped walls inside the precinct, castle_wall ones among them');
 const lows=LANDUSE.castleWalls.map(w=>Math.min(...w.line.map(p=>scene.terrain.heightAt(...p))));assert.ok(Math.min(...lows)>20,`on the Castle Rock (lowest ${Math.min(...lows).toFixed(1)} m)`);
 const b=new Batch();castleWalls(b,LANDUSE.castleWalls,scene.terrain);assert.ok(b.triangles>500);
 let lowest=Infinity;for(let i=0;i<b.positions.length;i+=3){const y=b.positions[i+1];assert.ok(Number.isFinite(y));}
 // every wall foot is below the ground under it (nothing floats); every top within its ASSUMED rise (+ battlements) of the ground
 for(let i=0;i<b.positions.length;i+=3){const x=b.positions[i],y=b.positions[i+1],z=b.positions[i+2],gr=scene.terrain.heightAt(x,z);lowest=Math.min(lowest,y-gr);
  assert.ok(y-gr<CASTLE_WALL.curtain+BATTLEMENT.height+12,'no wall towers over its ground');}
 assert.ok(lowest<0,'the feet are sunk');
 // nothing floats: at every metre of every wall the foot is under the ground at both faces
 for(const w of LANDUSE.castleWalls)for(let i=1;i<w.line.length;i++){const a=w.line[i-1],q=w.line[i],l=Math.hypot(q[0]-a[0],q[1]-a[1]);if(!l)continue;const n:[number,number]=[-(q[1]-a[1])/l,(q[0]-a[0])/l];
  for(let s=0;s<=l;s+=1){const p:[number,number]=[a[0]+(q[0]-a[0])*s/l,a[1]+(q[1]-a[1])*s/l],sec=castleWallSection(scene.terrain,p,n,CASTLE_WALL.curtain);
   for(const k of [-1,1])assert.ok(sec.lo<scene.terrain.heightAt(p[0]+n[0]*k*CASTLE_WALL.thickness/2,p[1]+n[1]*k*CASTLE_WALL.thickness/2),'the foot is in the ground');}}
});

test('the stone is grey-buff, not tan: each tint cancels its texture’s warm cast to the OSM sandstone hue (#9d9592)',()=>{
 const ch=(h:number)=>[(h>>16)&255,(h>>8)&255,h&255];
 for(const [name,tint,avg]of [['facade',WAVERLEY_CITY_STONE,CITY_TEXTURES.stone.average],['ashlar',WAVERLEY_CITY_ASHLAR,TEXTURES.stone.average],['Scott',SCOTT_STONE,TEXTURES.stone.average],['Calton',MONUMENT_STONE,TEXTURES.stone.average]] as const){
  const [r,g,b]=ch(avg).map((a,i)=>a*ch(tint)[i]/255);
  // #9d9592: red over blue 1.075, green over blue 1.02; allow a little either way
  assert.ok(r/b>1&&r/b<1.15&&g/b>.97&&g/b<1.1,`${name} renders ${[r,g,b].map(Math.round)}, not grey-buff`);
 }
});

test('no Castle wall runs down the crag: where a mapped wall climbs steeper than CASTLE_WALL.maxSlopeDeg it is cut',()=>{
 const b=new Batch();castleWalls(b,LANDUSE.castleWalls,scene.terrain);
 // the wall's walk (its upward faces) follows its ground: none may tilt further than the cut
 let steep=0,cut=0;for(const w of LANDUSE.castleWalls)for(let i=1;i<w.line.length;i++){const a=w.line[i-1],q=w.line[i];if(walkSlopeDeg(a,scene.terrain.heightAt(...a),q,scene.terrain.heightAt(...q))>CASTLE_WALL.maxSlopeDeg)cut++;}
 assert.ok(cut>0,'some mapped wall does run down the crag');
 const P=b.positions,cos=Math.cos((CASTLE_WALL.maxSlopeDeg+5)*Math.PI/180);
 for(let t=0;t<b.indices.length;t+=3){const [i,j,k]=[0,1,2].map(n=>b.indices[t+n]*3),u=[P[j]-P[i],P[j+1]-P[i+1],P[j+2]-P[i+2]],v=[P[k]-P[i],P[k+1]-P[i+1],P[k+2]-P[i+2]];
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);if(!l)continue;const ny=Math.abs(n[1])/l;if(ny>.05&&ny<cos)steep++;}
 assert.equal(steep,0,`${steep} drawn edges climb a crag face`);
});

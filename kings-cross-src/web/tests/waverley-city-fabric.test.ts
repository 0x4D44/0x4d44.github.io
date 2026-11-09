// W3 city, round 3: dormers and the shop band on the fabric, tree sizes held to their species, the obelisk, the Scott galleries and
// the stone's horizontal coursing, street paint by class (web/src/waverley-city*.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {roofPlan,dormer,DORMER} from '../src/waverley-city-roofs.ts';
import {Streets,shopBand,SHOP_BAND,SHOP_STREETS} from '../src/waverley-city-shops.ts';
import {LANDUSE,Footprints,placeTrees,TREE_SIZE,CROWN_SPREAD,roadColour,GROUND_COLOURS,slopeOf} from '../src/waverley-city-ground.ts';
import {stoneShell,OBELISK,OBELISK_FORM,ST_GILES} from '../src/waverley-city-monuments.ts';
import {buildWaverleyCityLandmarks,SCOTT_GALLERY,SCOTT_TIERS} from '../src/waverley-city.ts';
import {Batch} from '../src/materials.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import sceneFile from '../src/data/waverley-scene.json' with {type:'json'};

const data=unpackWaverleyScene(sceneFile);
const tenement={id:'t',outer:[[0,0],[30,0],[30,9],[0,9]] as Pt[],holes:[],height:18,minHeight:0,heightBasis:'ASSUMED',tags:{building:'apartments'},kind:'building' as const};

test('dormers: a line on each slope of a sharp-ridged tenement roof, clear of the stacks, each front standing on the roof',()=>{
 const p=roofPlan(tenement,10);assert.ok(p.dormers&&p.dormers.length>=4,'dormers on both slopes');
 for(const d of p.dormers!){assert.ok(Math.abs(d.y-p.at(d.x,d.z))<1e-9,'on the roof');assert.ok(d.y>p.eave&&d.y<p.top);
  for(const c of p.chimneys)assert.ok(Math.hypot(c.x-d.x,c.z-d.z)>=DORMER.clear-1e-9,'clear of the stacks');}
 assert.ok(p.dormers!.some(d=>d.n[1]>.9)&&p.dormers!.some(d=>d.n[1]<-.9),'both slopes, each looking down its own');
 // a deep plan's platform roof, an office and a shallow roof get none
 assert.equal(roofPlan({...tenement,outer:[[0,0],[30,0],[30,20],[0,20]]},10).dormers?.length??0,0,'no dormers on a platform roof');
 assert.equal(roofPlan({...tenement,tags:{building:'office'}},10).dormers?.length??0,0);
 // the drawn dormer: its front is vertical at the setback, and nothing of it goes under the roof by more than a hair
 const front=new Batch({colored:true}),roof=new Batch();for(const d of p.dormers!)dormer(front,roof,d,p.at,[1,1,1]);
 for(const b of [front,roof])for(let i=0;i<b.positions.length;i+=3)assert.ok(b.positions[i+1]>=p.at(b.positions[i],b.positions[i+2])-1e-6,'no part below the roof plane');
 assert.equal(front.triangles,3*p.dormers!.length);
});

test('the shop band: on the facades along a main or pedestrian street, a storey of stone left above, none on a lane',()=>{
 const princes=new Streets([{width:11,line:[[-100,-5.5],[100,-5.5]]}]);
 const block:Pt[]=[[0,0],[20,0],[20,20],[0,20]];
 const b=new Batch();assert.equal(shopBand(b,block,0,18,princes),2,'one band, on the street face only');
 for(let i=0;i<b.positions.length;i+=3){assert.ok(Math.abs(b.positions[i+2]+SHOP_BAND.proud)<1e-9,'proud of the north face');assert.ok(b.positions[i+1]<=SHOP_BAND.height+1e-9);}
 assert.equal(shopBand(new Batch(),block,0,6,princes),0,'too low a block keeps its stone');
 assert.equal(shopBand(new Batch(),[...block].reverse(),0,18,princes),2,'either winding');
 const real=new Streets();assert.ok(real.kerb([-185,-66])<SHOP_BAND.reach,'Princes Street by the Scott Monument (OSM unclassified) is a shop street');
 assert.ok(!('residential' in SHOP_STREETS)&&!('service' in SHOP_STREETS),'never a residential street or a lane');
});

test('trees are held to their species size: scrub 1.2-2.8 m, every crown within its spread, needleleaved narrow, an OSM height wins',()=>{
 const scene=buildWaverleyScene({lighting:false});
 try{
  const trees=placeTrees(scene.terrain,new Footprints([...data.buildings,...data.roofs].map(b=>b.outer)));
  for(const t of trees){const [lo,hi]=t.kind==='scrub'?TREE_SIZE.scrub:t.kind==='wood'?[TREE_SIZE.scrubTree[0],TREE_SIZE.wood[1]]:[0,TREE_SIZE.tree[1]];
   assert.ok(t.height>=lo-1e-9&&t.height<=hi+1e-9,`${t.kind} ${t.height.toFixed(1)} m`);assert.ok(t.crown<=t.height*CROWN_SPREAD[t.kind]+1e-9);}
  // gorse, broom and hawthorn scrub: literal limits, so a retune of TREE_SIZE has to come here with its reason
  assert.ok(trees.filter(t=>t.kind==='scrub').every(t=>t.height<=2.8+1e-9&&t.crown<=1.4+1e-9),'no scrub over 2.8 m tall or 1.4 m in crown radius');
  for(const [i,tag]of LANDUSE.treeTags){const [x,z]=LANDUSE.trees[i],t=trees.find(q=>q.kind==='tree'&&Math.hypot(q.x-x,q.z-z)<1e-6);if(!t)continue;
   if(tag.height)assert.equal(t.height,tag.height,'the OSM height');if(tag.needle)assert.ok(t.crown<=t.height*TREE_SIZE.needleSpread+1e-9,'a narrow conifer');}
  assert.ok([...LANDUSE.treeTags.values()].some(t=>t.needle)&&[...LANDUSE.treeTags.values()].some(t=>t.height===10));
  assert.ok(trees.some(t=>t.kind==='wood'&&t.height<TREE_SIZE.wood[0]),'scattered trees in the scrub');
 }finally{scene.dispose();}
});

test('the stone lies in courses: a wall face is UV-mapped in metres, u along its base and v up it',()=>{
 const b=new Batch();stoneShell(b,[[0,0],[6,0],[6,3],[0,3]],2,30);
 // the 6 m face from y 2 to 30: its UVs span 6 across and 28 up (so the 1.2 x 0.6 m ashlar repeats as horizontal courses)
 let maxU=0,maxV=0;for(let i=0;i<4;i++){maxU=Math.max(maxU,b.uvs[i*2]);maxV=Math.max(maxV,b.uvs[i*2+1]);}
 assert.equal(maxU,6);assert.equal(maxV,30);assert.equal(b.uvs[1],2);
});

test('the Scott galleries and the Martyrs obelisk: a dark recess on each tier face, a tapering shaft to the OSM 27 m',()=>{
 const g={heightAt:()=>0,rangeUnder:()=>({min:0,max:0,mean:0})},built=buildWaverleyCityLandmarks(g);
 try{
  const scott=built.group.getObjectByName('waverley-scott-monument') as THREE.Mesh,col=scott.geometry.getAttribute('color'),pos=scott.geometry.getAttribute('position');
  let dark=0;const tiers=new Set<number>();for(let i=0;i<col.count;i++)if(Math.abs(col.getX(i)-SCOTT_GALLERY.tone)<1e-6){dark++;tiers.add(SCOTT_TIERS.findIndex(t=>pos.getY(i)<=t.top+1e-6));}
  assert.ok(dark>=4*4*SCOTT_TIERS.length,'four or more recesses (four corners each) on every tier');assert.equal(tiers.size,SCOTT_TIERS.length);
  const m=built.group.getObjectByName('waverley-city-monuments') as THREE.Mesh,p=m.geometry.getAttribute('position');
  const o=data.buildings.find(b=>b.id===OBELISK.id)!,c=o.outer.reduce((a,v)=>[a[0]+v[0]/o.outer.length,a[1]+v[1]/o.outer.length],[0,0]),r0=Math.max(...o.outer.map(v=>Math.hypot(v[0]-c[0],v[1]-c[1])));
  const spread=(y0:number,y1:number)=>{let r=0;for(let i=0;i<p.count;i++)if(p.getY(i)>=y0&&p.getY(i)<=y1&&Math.hypot(p.getX(i)-c[0],p.getZ(i)-c[1])<r0*1.2)r=Math.max(r,Math.hypot(p.getX(i)-c[0],p.getZ(i)-c[1]));return r;};
  let top=0;for(let i=0;i<p.count;i++)if(Math.hypot(p.getX(i)-c[0],p.getZ(i)-c[1])<.1)top=Math.max(top,p.getY(i));
  assert.ok(Math.abs(top-OBELISK.height)<1e-6,'the pyramidion tip at the OSM 27 m');
  // the shaft's corners: at the pedestal top OBELISK_FORM.shaftBase of the footprint, at the pyramidion OBELISK_FORM.shaftTop
  const yc=OBELISK.height-OBELISK.cap,at=(y:number)=>{const r:number[]=[];for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-y)<1e-6&&Math.hypot(p.getX(i)-c[0],p.getZ(i)-c[1])<r0*1.2)r.push(Math.hypot(p.getX(i)-c[0],p.getZ(i)-c[1])/r0);return r;};
  assert.ok(at(OBELISK_FORM.pedestal).some(r=>Math.abs(r-OBELISK_FORM.shaftBase)<.02),'the shaft stands on the pedestal');
  const shaftBase=Math.max(...at(OBELISK_FORM.pedestal).filter(r=>r<.9)),shaftTop=Math.max(...at(yc));assert.ok(at(yc).length>=4&&shaftTop<shaftBase*.8,`and tapers to its top (${shaftTop.toFixed(2)} of ${shaftBase.toFixed(2)})`);
  assert.ok(spread(0,OBELISK_FORM.pedestal)>r0*.95,'the pedestal fills the OSM footprint');
 }finally{built.dispose();}
});

test('streets are painted by class, and the cliff line is a broken half-strength edge, not a black band',()=>{
 assert.equal(roadColour(11),GROUND_COLOURS.road);assert.equal(roadColour(5),GROUND_COLOURS.setts);assert.equal(roadColour(7),GROUND_COLOURS.lane);assert.equal(roadColour(4.5),GROUND_COLOURS.lane);
 assert.notEqual(GROUND_COLOURS.setts,GROUND_COLOURS.road);assert.notEqual(GROUND_COLOURS.lane,GROUND_COLOURS.road);
 const lum=(h:string)=>[1,3,5].reduce((s,i)=>s+parseInt(h.slice(i,i+2),16),0)/3;assert.ok(lum(GROUND_COLOURS.cliff)>lum(GROUND_COLOURS.road),'the cliff edge no darker than asphalt');
});

test('St Giles: the crossing tower to its eave, an open crown of eight ribs over it, the spirelet at the OSM 49 m',()=>{
 const g={heightAt:()=>0,rangeUnder:()=>({min:0,max:0,mean:0})},built=buildWaverleyCityLandmarks(g);
 try{
  const m=built.group.getObjectByName('waverley-city-monuments') as THREE.Mesh,p=m.geometry.getAttribute('position');
  const t=data.buildings.find(b=>b.id===ST_GILES.id)!,c=t.outer.reduce((a,v)=>[a[0]+v[0]/t.outer.length,a[1]+v[1]/t.outer.length],[0,0]);
  let top=0;for(let i=0;i<p.count;i++)if(Math.hypot(p.getX(i)-c[0],p.getZ(i)-c[1])<.1)top=Math.max(top,p.getY(i));
  assert.ok(Math.abs(top-49)<1e-6,'the spirelet tip at the OSM 49 m');
  // the crown is open: at mid-height between the tower top and the lantern the ribs are thin beams in eight directions, not a roof
  const eave=49-ST_GILES.crown,dirs=new Set<number>();let solid=0;
  for(let i=0;i<p.count;i++){const y=p.getY(i),dx=p.getX(i)-c[0],dz=p.getZ(i)-c[1],r=Math.hypot(dx,dz);if(y>eave+2.5&&y<eave+4.5&&r>2.2&&r<6.5)dirs.add(Math.round(Math.atan2(dz,dx)/(Math.PI/4)+8)%8);if(y>eave+2.5&&y<eave+4.5&&r<1)solid++;}
  assert.equal(dirs.size,8,'eight ribs');assert.equal(solid,0,'open in the middle under the lantern');
  assert.ok(built.omitBuildingIds.includes(ST_GILES.id),'the tower part is omitted from the fabric');
 }finally{built.dispose();}
});

test('scattered trees in scrub stand only on steep faces (the summits stay open)',()=>{
 const scene=buildWaverleyScene({lighting:false});
 try{
  const trees=placeTrees(scene.terrain,new Footprints([...data.buildings,...data.roofs].map(b=>b.outer)));
  const pip=(x:number,z:number,r:readonly Pt[])=>{let y=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])y=!y;}return y;};
  const inScrub=trees.filter(t=>t.kind==='wood'&&t.height<10&&LANDUSE.areas.scrub.some(rs=>pip(t.x,t.z,rs[0])));
  assert.ok(inScrub.length>20,`a belt of trees in the scrub (${inScrub.length})`);
  for(const t of inScrub)assert.ok(slopeOf(scene.terrain,t.x,t.z)>=28-1e-9,'on a steep face');
 }finally{scene.dispose();}
});

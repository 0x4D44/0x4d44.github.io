// W3 city, round 4: Calton Hill's hanging wood and rough grass, the Governor's House battlements and round tower, the Scott galleries'
// lancets (web/src/waverley-city*.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {Footprints,placeTrees,mownLawns} from '../src/waverley-city-ground.ts';
import {governorsHouse,roundBays} from '../src/waverley-city-monuments.ts';
import {cityHeight} from '../src/waverley-city-heights.ts';
import {buildWaverleyCityLandmarks,SCOTT_GALLERY,SCOTT_TIERS} from '../src/waverley-city.ts';
import {Batch} from '../src/materials.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import sceneFile from '../src/data/waverley-scene.json' with {type:'json'};

const data=unpackWaverleyScene(sceneFile);
const flat={heightAt:()=>0,rangeUnder:()=>({min:0,max:0,mean:0})};
const pip=(x:number,z:number,r:readonly Pt[])=>{let y=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])y=!y;}return y;};

test('Calton Hill’s south face is a hanging wood: crowns close enough to meet, where round 3 had 22 scattered trees',()=>{
 const scene=buildWaverleyScene({lighting:false});
 try{
  const trees=placeTrees(scene.terrain,new Footprints([...data.buildings,...data.roofs].map(b=>b.outer)));
  // the scrub strip under the Calton Craigs, from Regent Road down to Calton Road (R-wv3-d2)
  const face=trees.filter(t=>t.kind==='wood'&&t.x>240&&t.x<560&&t.z>-150&&t.z<-100);
  assert.ok(face.length>=80,`${face.length} trees on the face`);
  // each tree's nearest neighbour is within its own and that one's crown reach plus 1 m: a canopy, not dots
  const apart=face.filter(t=>!face.some(q=>q!==t&&Math.hypot(q.x-t.x,q.z-t.z)<t.crown+q.crown+1)).length;
  assert.ok(apart<=face.length*.1,`${apart} of ${face.length} crowns stand alone`);
 }finally{scene.dispose();}
});

test('mown stripes only on lawns and kept parks: Princes Street Gardens, not Calton Hill’s rough open-park grass',()=>{
 const mown=(x:number,z:number)=>mownLawns().some(([o,...h])=>pip(x,z,o)&&!h.some(r=>pip(x,z,r)));
 assert.ok(mown(-512,124),'the West Princes Street Gardens lawn (way/1486124339, landuse=grass)');
 // the bank below the Castle, mapped only as the gardens' park outline (relation/963806, a kept park: it has opening hours)
 assert.ok(mown(-587,268)&&mown(-611,275),'West Princes Street Gardens under the Castle');
 for(const [x,z]of [[493,-373],[609,-302],[551,-324]])assert.ok(!mown(x,z),`Calton Hill (way/1519743672, leisure=park only) at ${x},${z}`);
});

test('round bays: a run of outline points on one circle is found, a plain corner is not',()=>{
 // a 20 x 12 block with a half-round bay of radius 4 centred on its north side
 const bay:Pt[]=Array.from({length:9},(_,i)=>{const a=Math.PI*i/8;return [10+4*Math.cos(a),-4*Math.sin(a)] as Pt;});
 const found=roundBays([[0,0],...bay.reverse(),[20,0],[20,12],[0,12]]);
 assert.equal(found.length,1);assert.ok(Math.abs(found[0].r-4)<.05&&Math.hypot(found[0].c[0]-10,found[0].c[1])<.05,`${JSON.stringify(found)}`);
 assert.equal(roundBays([[0,0],[20,0],[20,12],[0,12]]).length,0,'a rectangle has none');
});

test('the Governor’s House is battlemented, with a round tower over its north-west bay standing 3.5 m above the roof',()=>{
 const house=data.buildings.find(b=>b.id==='way/239888878')!;assert.ok(house);
 const b=new Batch({colored:true});governorsHouse(b,house,17,flat);
 const P=b.positions;let towerTop=0,merlonTops=0;
 for(let i=0;i<P.length;i+=3){const r=Math.hypot(P[i]-327,P[i+2]+134.8);if(Math.abs(P[i+1]-20.5)<1e-6&&r<5)towerTop++;if(Math.abs(P[i+1]-17.8)<1e-6)merlonTops++;}
 assert.ok(towerTop>=16,`the tower's top at 17 + 3.5 m (${towerTop} points)`);
 assert.ok(Math.abs(Math.max(...P.filter((_,i)=>i%3===1))-21.3)<1e-6,'its merlons the highest, 0.8 m over the tower top');
 assert.ok(merlonTops/4>=30,`merlons along the roof edge (${merlonTops/4})`);
 assert.ok(b.colors.every(c=>Math.abs(c-.7)<1e-6),'the sooted city stone, not the pale Calton tone');
});

test('the Scott galleries are arcades: three pointed lancets with mullions between them on each face of every tier',()=>{
 const built=buildWaverleyCityLandmarks(flat);
 try{
  const scott=built.group.getObjectByName('waverley-scott-monument') as THREE.Mesh,col=scott.geometry.getAttribute('color'),pos=scott.geometry.getAttribute('position');
  // per tier, the dark points at the tier's highest dark level are the lancet apexes: 3 on each of 4 faces
  SCOTT_TIERS.forEach((t,ti)=>{const lo=ti?SCOTT_TIERS[ti-1].top:0,dark:THREE.Vector3[]=[];
   for(let i=0;i<col.count;i++)if(Math.abs(col.getX(i)-SCOTT_GALLERY.tone)<1e-6&&pos.getY(i)>lo&&pos.getY(i)<=t.top)dark.push(new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)));
   assert.ok(dark.length,`tier ${ti} has its gallery`);const top=Math.max(...dark.map(v=>v.y)),apex=new Set(dark.filter(v=>Math.abs(v.y-top)<1e-6).map(v=>`${v.x.toFixed(3)},${v.z.toFixed(3)}`));
   assert.equal(apex.size,12,`tier ${ti}: ${apex.size} lancet apexes`);});
 }finally{built.dispose();}
});

test('a tiny footprint with no height is one storey, not a 12 m post; a tiny building:part keeps its height up on its building',()=>{
 for(const id of ['way/258095237','way/258095246']){const b=data.buildings.find(q=>q.id===id)!;assert.ok(b,id);assert.deepEqual(cityHeight(b),{height:3,basis:'ASSUMED'},`${id} on Castle Rock`);}
 const sq=(w:number):Pt[]=>[[0,0],[w,0],[w,w],[0,w]];
 const base={id:'way/1',height:12,minHeight:0,heightBasis:'ASSUMED 12m; OSM height absent; ASSUMED minHeight 0m'};
 assert.equal(cityHeight({...base,outer:sq(1.9),tags:{building:'yes'}}).height,3,'3.6 m2');
 assert.equal(cityHeight({...base,outer:sq(1.9),tags:{'building:part':'yes'}}).height,12,'a part');
 assert.equal(cityHeight({...base,outer:sq(2.1),tags:{building:'yes'}}).height,12,'4.4 m2: the fallback');
});

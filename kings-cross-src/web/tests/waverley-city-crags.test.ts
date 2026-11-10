// W3 city, round 6: the ground cover seated over the drawn ground at the crests, the outlook rule held to the hill walks, and the
// hanging wood standing on the ground (web/src/waverley-city-ground.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {buildWaverleyCityLandmarks} from '../src/waverley-city.ts';
import {seatDrape,foldUp,placeTrees,Footprints,LANDUSE} from '../src/waverley-city-ground.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import sceneFile from '../src/data/waverley-scene.json' with {type:'json'};

const data=unpackWaverleyScene(sceneFile);

test('each Scott head pinnacle is crocketed and finialled: 8 crockets up its four arrises, standing out from them, and a knob 0.5 m over its tip',()=>{
 const flat={heightAt:()=>0,rangeUnder:()=>({min:0,max:0,mean:0})};
 const built=buildWaverleyCityLandmarks(flat);
 try{
  const pos=(built.group.getObjectByName('waverley-scott-monument') as THREE.Mesh).geometry.getAttribute('position');
  const at=(y:number)=>{const s=new Map<string,[number,number]>();for(let i=0;i<pos.count;i++)if(Math.abs(pos.getY(i)-y)<1e-4)s.set(`${pos.getX(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`,[pos.getX(i),pos.getZ(i)]);return [...s.values()];};
  for(const y of [21.11,29,38,46,52]){
   const heads=at(y+3.5),finials=at(y+4);assert.equal(heads.length,4,`head pinnacles over ${y} m`);
   // the finial's tip is over its pinnacle's
   assert.equal(finials.length,4,`finials over ${y} m`);for(const f of finials)assert.ok(heads.some(h=>Math.hypot(h[0]-f[0],h[1]-f[1])<1e-3),`a finial over ${y} m stands on a pinnacle's tip`);
   // crockets at 0.35 and 0.65 of the way up the 2.9 m pyramid (from 0.6 m), rising 0.3 m from 5 cm under the arris point: each tip
   // lies off the pyramid's face at its height, out on the corner's diagonal (the pyramid is 0.8 m square: half-width 0.4 at its foot)
   for(const f of [.35,.65]){const tips=at(y+.6+2.9*f-.05+.3);assert.equal(tips.length,16,`crockets ${f} up the pinnacles over ${y} m: ${tips.length} tips`);
    for(const t of tips){const h=heads.reduce((a,b)=>Math.hypot(b[0]-t[0],b[1]-t[1])<Math.hypot(a[0]-t[0],a[1]-t[1])?b:a),dx=Math.abs(t[0]-h[0]),dz=Math.abs(t[1]-h[1]);
     assert.ok(Math.min(dx,dz)>.4*(1-f)-.01&&Math.hypot(dx,dz)<.4*(1-f)*Math.SQRT2+.2,`a crocket over ${y} m sits out on an arris (${dx.toFixed(2)}, ${dz.toFixed(2)})`);}}
  }
 }finally{built.dispose();}
});
const near=(trees:{x:number;z:number;kind:string}[],kind:string,x:number,z:number,r:number)=>trees.filter(t=>t.kind===kind&&Math.hypot(t.x-x,t.z-z)<r).length;

test('a viewing place keeps its outlook, and only a viewing place: the knoll by the Dugald Stewart Monument is gorse, the Castle foot belt and the obelisk trees stand',()=>{
 const scene=buildWaverleyScene({lighting:false});
 try{
  const trees=placeTrees(scene.terrain,new Footprints([...data.buildings,...data.roofs].map(b=>b.outer))),T=scene.terrain;
  // the mapped viewing places: OSM viewpoints and peaks (points) and the attraction monuments (outlines), the Dugald Stewart Monument among them
  assert.ok(LANDUSE.outlooks.length>=15,`${LANDUSE.outlooks.length} places`);
  assert.ok(LANDUSE.outlooks.some(r=>r.length>4&&r.every(([x,z])=>Math.hypot(x-372.5,z+290.7)<6)),"the Dugald Stewart Monument outline (way/320974678), about (372, -291), about 10 m across");
  // no hanging-wood tree within 20 m of one stands more than 1.5 m over its ground
  const seg=(x:number,z:number,a:readonly number[],b:readonly number[])=>{const dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz);};
  let checked=0;
  for(const t of trees.filter(t=>t.hanging))for(const r of LANDUSE.outlooks){const d=r.length===1?Math.hypot(t.x-r[0][0],t.z-r[0][1]):Math.min(...r.map((a,i)=>seg(t.x,t.z,a,r[(i+1)%r.length])));
   if(d>20)continue;checked++;const g=Math.min(...r.map(([x,z])=>T.heightAt(x,z)));assert.ok(t.y+t.height<=g+1.5+1e-9,`a tree at ${t.x.toFixed(0)},${t.z.toFixed(0)} overtops a viewing place`);}
  assert.ok(checked>=5,`${checked} hanging trees by a viewing place, kept low`);
  // the crown that closed the panorama west (round 4) is gorse; the rule takes few trees (round 5's path rule took 223)
  assert.equal(near(trees,'wood',358,-283,5),0,'no wood on the knoll west of the Dugald Stewart Monument');
  assert.ok(near(trees,'scrub',358,-283,5)>=1,'gorse there instead');
  // the other side: no viewing place near them, so they stand (round 5 stripped them)
  assert.ok(near(trees,'wood',-774,350,18)>=8,`${near(trees,'wood',-774,350,18)} trees in the wooded belt at the foot of Castle Rock (R-wv3-a)`);
  assert.ok(near(trees,'wood',-651,268,8)>=3,'the belt under the Castle west of the Ross Fountain');
  assert.ok(near(trees,'wood',252,-153,9)>=2,'the trees on Old Calton beside the Political Martyrs’ obelisk (R-wv3-d2)');
  assert.ok(near(trees,'wood',526,-250,10)>=3,'the summit trees south of the Nelson Monument');
 }finally{scene.dispose();}
});

test('the hanging wood stands on trunks: every wood and park tree has one, so no crown floats over the slope',()=>{
 const scene=buildWaverleyScene({lighting:false});
 try{
  const trees=placeTrees(scene.terrain,new Footprints([...data.buildings,...data.roofs].map(b=>b.outer)));
  const hanging=trees.filter(t=>t.hanging).length,standing=trees.filter(t=>t.kind!=='scrub').length;assert.ok(hanging>900,`${hanging} hanging-wood trees`);
  let trunks:THREE.InstancedMesh|undefined;scene.group.traverse(o=>{if(o.name==='waverley-tree-trunks')trunks=o as THREE.InstancedMesh;});
  assert.equal(trunks?.count,standing,'one trunk for each tree that is not gorse, the hanging wood included');
 }finally{scene.dispose();}
});

const coverOf=(group:THREE.Object3D)=>{let m:THREE.Mesh|undefined;group.traverse(o=>{if(o.name==='waverley-ground-cover'&&(o as THREE.Mesh).isMesh)m=o as THREE.Mesh;});assert.ok(m,'the cover is drawn');return m!;};

test('the ground cover never dips under the drawn ground: 5 cm clear at every half metre, the Castle summit face included (round 4 pale slab)',()=>{
 const scene=buildWaverleyScene({lighting:false});
 try{
  const cover=coverOf(scene.group),P=cover.geometry.getAttribute('position'),I=cover.geometry.getIndex()!,T=scene.terrain,{x0,z0,x1,z1}=T.extent;
  // the depth pull stays a constant one unit: a slope factor pulls the cover over low roofs and building bases (round 5's gate)
  const mat=cover.material as THREE.Material;assert.equal(mat.polygonOffsetFactor,-1);assert.equal(mat.polygonOffsetUnits,-1);
  let worst=Infinity,at='',slab=Infinity,n=0;
  for(let i=0;i<I.count;i+=3){const v=[0,1,2].map(k=>{const j=I.getX(i+k);return [P.getX(j),P.getY(j),P.getZ(j)];});
   const e=Math.max(...[0,1,2].map(k=>Math.hypot(v[k][0]-v[(k+1)%3][0],v[k][2]-v[(k+1)%3][2]))),m=Math.max(1,Math.ceil(e/.5));
   for(let a=0;a<=m;a++)for(let b=0;a+b<=m;b++){const u=a/m,w=b/m,s=1-u-w;
    const x=Math.min(x1-.001,Math.max(x0+.001,v[0][0]*s+v[1][0]*u+v[2][0]*w)),z=Math.min(z1-.001,Math.max(z0+.001,v[0][2]*s+v[1][2]*u+v[2][2]*w));
    const clear=v[0][1]*s+v[1][1]*u+v[2][1]*w-T.heightAt(x,z);n++;
    if(clear<worst){worst=clear;at=`${x.toFixed(1)},${z.toFixed(1)}`;}
    if(Math.abs(x+660)<4&&Math.abs(z-298)<3)slab=Math.min(slab,clear);}}
  assert.ok(n>1e7,`${n} samples`);
  assert.ok(worst>=.05,`the cover is ${worst.toFixed(3)} m over the drawn ground at ${at}`);
  assert.ok(slab>=.05&&slab<2,`the Castle summit face (-660, 298): the cover is ${slab.toFixed(3)} m over the ground`);
 }finally{scene.dispose();}
});

test('foldUp turns a quad onto its upper diagonal where its fold runs under the ground, and keeps its own fold over a hollow',()=>{
 // a 8 m square: corners nw (0,0) y 0, ne (8,0) y 2, se (8,8) y 0, sw (0,8) y 2. Folded on nw-se its middle stands at 0; on ne-sw at 2.
 const quad=()=>new Float32Array([0,0,0, 8,2,0, 8,0,8, 0,2,8]),tris=()=>[0,2,1, 0,3,2];
 const ridge={heightAt:()=>1.5}; // a ridge along ne-sw at 1.5 m: the nw-se fold (0 at the middle) runs 1.5 m under it
 const p=quad(),i=tris();assert.equal(foldUp(p,i,ridge),1);
 assert.deepEqual([...i].sort(),[0,1,1,2,3,3].sort(),'the facets now share the ne-sw diagonal');
 assert.ok([[i[0],i[1],i[2]],[i[3],i[4],i[5]]].every(t=>t.includes(1)&&t.includes(3)),'both facets carry ne and sw');
 // same winding (counter-clockwise in x, z as before: the area's sign is kept)
 const area=(a:number,b:number,c:number)=>(p[b*3]-p[a*3])*(p[c*3+2]-p[a*3+2])-(p[b*3+2]-p[a*3+2])*(p[c*3]-p[a*3]);
 const was=Math.sign(area(0,2,1));assert.ok(Math.sign(area(i[0],i[1],i[2]))===was&&Math.sign(area(i[3],i[4],i[5]))===was,'winding kept');
 // over a hollow (ground at -1, the fold 1 m over it) the drape keeps its own fold
 const h=tris();assert.equal(foldUp(quad(),h,{heightAt:()=>-1}),0);assert.deepEqual(h,tris());
});

test('seatDrape lifts a facet over a ridge between its corners, by the shortfall plus 0.1 m, and leaves clear ground alone',()=>{
 // a sharp east-west ridge along z = 6 (on the 1 m sampling: the long edge is cut in 15), 2 m high, under a flat facet whose corners sit at the ground's edge heights
 const ridge={extent:{x0:-100,z0:-100,x1:100,z1:100},heightAt:(_x:number,z:number)=>Math.max(0,2-Math.abs(z-6))};
 const pos=new Float32Array([0,0,0, 10,0,10, 0,0,10]),index=[0,1,2];
 assert.equal(seatDrape(pos,index,ridge),3);
 // the facet's lowest point over the ridge crest (2 m) now clears it by 0.1 m: every corner rises 2.1 m
 for(const v of [0,1,2])assert.ok(Math.abs(pos[v*3+1]-2.1)<1e-6,`corner ${v} at ${pos[v*3+1]}`);
 const high=new Float32Array([0,3,0, 10,3,10, 0,3,10]);
 assert.equal(seatDrape(high,index,ridge),0);
 assert.deepEqual([...high].filter((_,i)=>i%3===1),[3,3,3]);
 // a corner shared by two facets takes the larger lift (the ridge facet's 2.1 m, not the flat facet's 0.1 m: its corners on the
 // ground are 0.1 m short of clear); the flat facet's far corner takes only its own facet's 0.1 m
 const two=new Float32Array([0,0,0, 10,0,10, 0,0,10, 40,3,40]),both=[0,1,2, 1,3,2];
 seatDrape(two,both,ridge);
 assert.ok(Math.abs(two[1*3+1]-2.1)<1e-6&&Math.abs(two[3*3+1]-3.1)<1e-6,`shared corner ${two[4]}, far corner ${two[10]}`);
});

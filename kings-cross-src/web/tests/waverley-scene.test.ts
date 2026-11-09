import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import {terrainFromFunction} from '../../core/terrain.ts';
import {material} from '../src/materials.ts';
import {WAVERLEY_FRONTAGE_OMIT_IDS} from '../src/waverley-frontage.ts';
import {WAVERLEY_CITY_OMIT_IDS} from '../src/waverley-city.ts';
import {RAILWAY_OVERLAP_TOLERANCE, WAVERLEY_LEVELS, buildWaverleyScene, polygonSurface, waverleyGround, waverleyRailwayIntrusions, waverleyTrackSegments} from '../src/waverley-scene.ts';

const rect=(x0:number,z0:number,x1:number,z1:number):[number,number][]=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const empty=():WaverleyData=>({origin:{lat:55.9519018,lon:-3.1904199},bbox:[55.9465,-3.205,55.9575,-3.173],attribution:'© OpenStreetMap contributors (ODbL)',source:{url:'synthetic',fetchedAt:'2026-01-01',sha256:'synthetic',license:'ODbL',query:'synthetic'},rails:[],platforms:[],roofs:[],buildings:[],warnings:[]});
const area=(id:string,outer:[number,number][],holes:[number,number][][]=[])=>({id,outer,holes,height:8,minHeight:0,heightBasis:'ASSUMED synthetic',kind:'building' as const,tags:{}});
const real=():WaverleyData=>unpackWaverleyScene(JSON.parse(readFileSync(new URL('../src/data/waverley-scene.json',import.meta.url),'utf8')));
const flat=()=>terrainFromFunction(()=>-.2,{x0:-128,z0:-128,x1:128,z1:128},8);
function areaOf(g:THREE.BufferGeometry):number {
 const p=g.getAttribute('position'),idx=g.getIndex();let a=0;
 for(let i=0;i<(idx?.count??p.count);i+=3){const vs=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k));a+=new THREE.Vector3().subVectors(vs[1],vs[0]).cross(new THREE.Vector3().subVectors(vs[2],vs[0])).length()/2;}
 return a;
}

test('Waverley surface preserves a concave footprint and its hole in either winding',()=>{
 const outer:[[number,number],...[number,number][]]=[[0,0],[20,0],[20,10],[12,10],[12,20],[0,20]];
 for(const reverse of [false,true]){
  const hole=rect(2,2,6,6),g=polygonSurface(reverse?[...outer].reverse():outer,reverse?[[...hole].reverse()]:[hole],()=>8);
  assert.ok(Math.abs(areaOf(g)-(320-16))<1e-6,'only the mapped ring is triangulated');
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(4,50,4),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length,0,'hole remains open');
  assert.ok(new THREE.Raycaster(new THREE.Vector3(10,50,4),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length>0,'roof exists outside hole');
  g.dispose();(mesh.material as THREE.Material).dispose();
 }
});

test('Waverley track draws only open heavy rail and deduplicates shared segments',()=>{
 const d=empty();d.rails=[{id:'way/1',path:[[0,0],[10,0]],tags:{railway:'rail'}},{id:'way/2',path:[[10,0],[0,0]],tags:{railway:'rail'}},{id:'way/3',path:[[10,0],[20,0]],tags:{railway:'tram'}},{id:'way/4',path:[[20,0],[30,0]],tags:{railway:'rail',tunnel:'yes'}},{id:'way/5',path:[[30,0],[40,0]],tags:{railway:'rail',layer:'-1'}}];
 assert.deepEqual(waverleyTrackSegments(d),[[0,0,10,0]],'no tram, duplicate, or surface tunnel line');
});

test('Waverley ground keeps the station and open tracks level while retaining distant Scottish relief',()=>{
 const d=empty();d.roofs=[area('relation/240040',rect(-16,-16,16,16),[rect(-4,-4,4,4)])];d.rails=[{id:'way/1',path:[[-100,0],[100,0]],tags:{railway:'rail'}}];
 const raw=terrainFromFunction((x,z)=>20+z*.1,{x0:-256,z0:-256,x1:256,z1:256},8);const ground=waverleyGround(d,raw);
 assert.ok(Math.abs(ground.heightAt(0,0)+.2)<1e-6,'hole building stands at the same station floor');
 assert.ok(Math.abs(ground.heightAt(80,0)+.2)<1e-6,'track beds do not follow DTM roof/bridge outliers');
 assert.ok(Math.abs(ground.heightAt(0,128)-raw.heightAt(0,128))<1e-6,'distant relief is not flattened');
 assert.ok(ground.heightAt(0,32)>-.2&&ground.heightAt(0,32)<raw.heightAt(0,32),'transition is a blend, not a cliff');
});

test('Waverley exposes its Scottish terrain source separately from the OSM map attribution',()=>{
 const source=JSON.parse(readFileSync(new URL('../src/data/waverley-terrain.json',import.meta.url),'utf8'));
 const built=buildWaverleyScene({data:empty(),terrain:flat(),lighting:false});
 try {
  assert.equal(built.groundAttribution,source.attribution);
  assert.match(built.groundAttribution,/Scottish Government/);
  assert.doesNotMatch(built.groundAttribution,/Environment Agency/);
 } finally {built.dispose();}
});

test('Waverley dispose frees owned geometry once, detaches the scene and preserves shared materials',()=>{
 const d=empty();d.platforms=[{id:'way/1',ref:'1',path:rect(0,0,20,4),tags:{train:'yes',railway:'platform'}}];d.roofs=[area('relation/240040',rect(-10,-10,30,10),[rect(0,0,4,4)])];d.buildings=[area('way/3',rect(50,50,55,55))];
 const built=buildWaverleyScene({data:d,terrain:flat(),lighting:false});const parent=new THREE.Group();parent.add(built.group);
 const geos=new Set<THREE.BufferGeometry>();built.group.traverse(o=>{if(o instanceof THREE.Mesh)geos.add(o.geometry);});assert.ok(geos.size>=4);
 let freed=0,shared=0;for(const g of geos)g.addEventListener('dispose',()=>freed++);const listener=()=>shared++;material('stone').addEventListener('dispose',listener);
 built.dispose();built.dispose();assert.equal(freed,geos.size,'each owned draw geometry freed exactly once');assert.equal(shared,0,'cached station materials survive scene changes');assert.equal(built.group.parent,null);assert.equal(built.group.children.length,0);
 material('stone').removeEventListener('dispose',listener);
});

test('Waverley hillside buildings have one level sunk wall base and outward-facing walls',()=>{
 const d=empty(),footprint=rect(16,16,32,32);d.buildings=[area('way/synthetic-slope',footprint)];
 const raw=terrainFromFunction((x,z)=>x*.2+z*.1,{x0:-128,z0:-128,x1:128,z1:128},8);
 const built=buildWaverleyScene({data:d,terrain:raw,lighting:false});
 const expected=built.terrain.rangeUnder(footprint,4).min-.15;
 const mesh=built.parts.buildings.getObjectByName('waverley-building-walls') as THREE.Mesh;
 const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
 for(let i=0;i<p.count;i+=4){
  const ys=[0,1,2,3].map(j=>p.getY(i+j)).sort((a,b)=>a-b);
  assert.ok(Math.abs(ys[0]-expected)<1e-5&&Math.abs(ys[1]-expected)<1e-5,'each wall starts at the same footprint minimum minus the 0.15 m sink');
  const cx=[0,1,2,3].reduce((s,j)=>s+p.getX(i+j)/4,0),cz=[0,1,2,3].reduce((s,j)=>s+p.getZ(i+j)/4,0);
  assert.ok((cx-24)*n.getX(i)+(cz-24)*n.getZ(i)>0,'outside face points away from the building interior');
 }
 built.dispose();
});

test('Waverley walls remain visible from outside and materials use independent sandstone/slate/glazing variants',()=>{
 const d=empty();d.buildings=[area('way/1',rect(0,0,20,20))];d.roofs=[area('relation/240040',rect(0,0,20,20),[rect(4,4,6,6)])];
 const built=buildWaverleyScene({data:d,terrain:flat(),lighting:false});built.group.updateMatrixWorld(true);
 const mesh=built.parts.buildings.getObjectByName('waverley-building-walls') as THREE.Mesh;
 assert.ok(new THREE.Raycaster(new THREE.Vector3(10,3,-10),new THREE.Vector3(0,0,1),0,15).intersectObject(mesh).length>0,'near exterior wall is not back-face culled');
 const wall=mesh.material as THREE.MeshLambertMaterial,roof=(built.parts.buildings.getObjectByName('waverley-building-tops') as THREE.Mesh).material as THREE.MeshLambertMaterial;
 assert.notEqual(wall,material('stone'),'local tint must not mutate a shared KX material');
 assert.notEqual(roof,material('slate'));
 assert.equal(wall.vertexColors,true,'OSM blocks can vary subtly without extra draws');
 assert.notEqual(wall.color.getHex(),roof.color.getHex());
 const glass=(built.parts.roof.getObjectByName('waverley-mapped-roofs') as THREE.Mesh).material as THREE.MeshLambertMaterial;
 assert.equal(glass.transparent,true);assert.ok(glass.opacity<1&&glass.opacity>.3,'glazed roof transmits light');
 let freed=0;wall.addEventListener('dispose',()=>freed++);roof.addEventListener('dispose',()=>freed++);glass.addEventListener('dispose',()=>freed++);
 built.dispose();assert.equal(freed,3,'scene owns and releases its local material variants');
});

test('Waverley committed station roof has its actual OSM central hole, with no solid parent extrusion',()=>{
 const d=real();const built=buildWaverleyScene({data:d,lighting:false});const roof=d.roofs.find(r=>r.id==='relation/240040');assert.ok(roof);assert.equal(roof.holes.length,1);
 const g=built.parts.roof;assert.ok(g.children.length>0);assert.ok(!d.buildings.some(r=>r.id==='way/5208866'));
 const hole=roof.holes[0],mid=hole.reduce((a,p)=>[a[0]+p[0]/hole.length,a[1]+p[1]/hole.length],[0,0]);g.updateMatrixWorld(true);
 assert.equal(new THREE.Raycaster(new THREE.Vector3(mid[0],1000,mid[1]),new THREE.Vector3(0,-1,0)).intersectObject(g,true).length,0,'station glazing never covers central building');
 assert.equal(built.stats.platforms,23);// Scene budget sized for the three Waverley elements under Arthur's 2026-11-09 21:56 ruling (4x caps); the FPS gate is the real guard.
 assert.ok(built.stats.triangles>1000&&built.stats.triangles<1000000);assert.ok(built.stats.drawCalls<=80);built.dispose();
});

test('Waverley default scene includes the mapped landmarks within the complete scene budget',()=>{
 const built=buildWaverleyScene({lighting:false});
 assert.ok(built.parts.buildings.getObjectByName('waverley-scott-monument'));
 assert.ok(built.parts.buildings.getObjectByName('waverley-balmoral-clock-dials'));
 assert.ok(built.parts.buildings.getObjectByName('waverley-bridge-decks'));
 let triangles=0,draws=0;
 built.group.traverse(o=>{if(o instanceof THREE.Mesh){const faces=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;triangles+=faces*(o instanceof THREE.InstancedMesh?o.count:1);draws++;}else if(o instanceof THREE.LineSegments)draws++;});
 assert.equal(built.stats.triangles,triangles);assert.equal(built.stats.drawCalls,draws);
 // Sized for the three Waverley elements under Arthur's 2026-11-09 21:56 budget ruling; still far under the 2,000,000-triangle frame ceiling.
 assert.ok(triangles<1500000,`complete geometry has ${triangles} triangles`);
 assert.ok(draws<=150,`complete geometry has ${draws} draws`);built.dispose();
});

// The railway is kept clear of city blocks by a general rule (waverleyRailwayIntrusions), not by id. These checks measure the
// overlap independently of the rule's polygon clipping: a 0.25 m probe grid over each drawn footprint, a probe counting as railway
// when it is within the ballast half-width of a drawn track segment or inside a mapped platform.
function railwayProbeOverlap(d:WaverleyData,footprint:{outer:[number,number][];holes:[number,number][][]}):number {
 const inRing=(x:number,z:number,p:[number,number][])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
 const xs=footprint.outer.map(p=>p[0]),zs=footprint.outer.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs),half=WAVERLEY_LEVELS.ballastHalfWidth;
 const tracks=waverleyTrackSegments(d).filter(([ax,az,bx,bz])=>Math.max(ax,bx)+half>=x0&&Math.min(ax,bx)-half<=x1&&Math.max(az,bz)+half>=z0&&Math.min(az,bz)-half<=z1);
 const platforms=d.platforms.map(p=>p.path as [number,number][]).filter(p=>!(Math.max(...p.map(v=>v[0]))<x0||Math.min(...p.map(v=>v[0]))>x1||Math.max(...p.map(v=>v[1]))<z0||Math.min(...p.map(v=>v[1]))>z1));
 if(!tracks.length&&!platforms.length)return 0;
 const near=(x:number,z:number,[ax,az,bx,bz]:number[])=>{const dx=bx-ax,dz=bz-az,t=((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz);return t>0&&t<1&&Math.hypot(x-ax-t*dx,z-az-t*dz)<half;};
 let probes=0;
 for(let x=x0+.125;x<x1;x+=.25)for(let z=z0+.125;z<z1;z+=.25){
  if(!inRing(x,z,footprint.outer)||footprint.holes.some(h=>inRing(x,z,h)))continue;
  if(tracks.some(s=>near(x,z,s))||platforms.some(p=>inRing(x,z,p)))probes++;
 }
 return probes*.0625;
}

test('no drawn Waverley city block stands on a track or a platform (way/377738789 beside Waverley Bridge did, by 440 m²)',()=>{
 const d=real(),built=buildWaverleyScene({lighting:false});
 try {
  const drawn=new Set(built.buildingIds),byId=new Map(d.buildings.map(b=>[b.id,b]));
  assert.ok(!drawn.has('way/377738789'),'the 12 m block on the tracks and platforms beside Waverley Bridge is not drawn');
  const standing=[...drawn].map(id=>[id,railwayProbeOverlap(d,byId.get(id)!)] as const).filter(([,m2])=>m2>=RAILWAY_OVERLAP_TOLERANCE);
  assert.deepEqual(standing,[],'every drawn block overlaps the railway by less than the mapping tolerance');
  assert.ok(drawn.has('way/62065007'),'an office whose wall overlaps a platform edge by a mapping sliver is kept');
  const left=new Set([...WAVERLEY_FRONTAGE_OMIT_IDS,...WAVERLEY_CITY_OMIT_IDS,...waverleyRailwayIntrusions(d)]);
  assert.deepEqual([...drawn],d.buildings.map(b=>b.id).filter(id=>!left.has(id)),'only the landmark replacements and the railway intrusions are left out');
 } finally {built.dispose();}
});

test('the railway rule drops a block across a track or on a platform and keeps one that only touches or slivers into it',()=>{
 const d=empty();
 d.rails=[{id:'way/1',path:[[0,0],[100,0]],tags:{railway:'rail'}}];
 d.platforms=[{id:'way/2',ref:'1',path:rect(0,4,100,8),tags:{railway:'platform'}},{id:'way/3',ref:'2',path:rect(60,140,70,150),tags:{railway:'platform'}}];
 d.buildings=[area('way/across',rect(40,-10,50,10)),area('way/on-platform',rect(60,5,70,7)),area('way/touching',rect(0,8,20,20)),
  area('way/sliver',rect(80,7.95,95,20)),area('way/clear',rect(0,30,10,40)),area('way/courtyard',rect(50,130,80,160),[rect(55,135,75,155)])];
 assert.deepEqual(waverleyRailwayIntrusions(d),['way/across','way/on-platform']);
 const built=buildWaverleyScene({data:d,terrain:flat(),lighting:false});
 try {assert.deepEqual(built.buildingIds,['way/touching','way/sliver','way/clear','way/courtyard']);} finally {built.dispose();}
});

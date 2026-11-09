import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import {terrainFromFunction} from '../../core/terrain.ts';
import {material} from '../src/materials.ts';
import {buildWaverleyScene, polygonSurface, waverleyGround, waverleyTrackSegments} from '../src/waverley-scene.ts';

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

test('Waverley dispose frees owned geometry once, detaches the scene and preserves shared materials',()=>{
 const d=empty();d.platforms=[{id:'way/1',ref:'1',path:rect(0,0,20,4),tags:{train:'yes',railway:'platform'}}];d.roofs=[area('relation/240040',rect(-10,-10,30,10),[rect(0,0,4,4)])];d.buildings=[area('way/3',rect(50,50,55,55))];
 const built=buildWaverleyScene({data:d,terrain:flat(),lighting:false});const parent=new THREE.Group();parent.add(built.group);
 const geos=new Set<THREE.BufferGeometry>();built.group.traverse(o=>{if(o instanceof THREE.Mesh)geos.add(o.geometry);});assert.ok(geos.size>=4);
 let freed=0,shared=0;for(const g of geos)g.addEventListener('dispose',()=>freed++);const listener=()=>shared++;material('stone').addEventListener('dispose',listener);
 built.dispose();built.dispose();assert.equal(freed,geos.size,'each owned draw geometry freed exactly once');assert.equal(shared,0,'cached station materials survive scene changes');assert.equal(built.group.parent,null);assert.equal(built.group.children.length,0);
 material('stone').removeEventListener('dispose',listener);
});

test('Waverley committed station roof has its actual OSM central hole, with no solid parent extrusion',()=>{
 const d=real();const built=buildWaverleyScene({data:d,lighting:false});const roof=d.roofs.find(r=>r.id==='relation/240040');assert.ok(roof);assert.equal(roof.holes.length,1);
 const g=built.parts.roof;assert.ok(g.children.length>0);assert.ok(!d.buildings.some(r=>r.id==='way/5208866'));
 const hole=roof.holes[0],mid=hole.reduce((a,p)=>[a[0]+p[0]/hole.length,a[1]+p[1]/hole.length],[0,0]);g.updateMatrixWorld(true);
 assert.equal(new THREE.Raycaster(new THREE.Vector3(mid[0],1000,mid[1]),new THREE.Vector3(0,-1,0)).intersectObject(g,true).length,0,'station glazing never covers central building');
 assert.equal(built.stats.platforms,23);assert.ok(built.stats.triangles>1000&&built.stats.triangles<350000);assert.ok(built.stats.drawCalls<=16);built.dispose();
});

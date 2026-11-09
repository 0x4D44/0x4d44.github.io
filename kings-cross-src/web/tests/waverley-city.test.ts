import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWaverleyCityLandmarks,WAVERLEY_CITY_HEIGHTS,WAVERLEY_CITY_SOURCES,WAVERLEY_CITY_OMIT_IDS} from '../src/waverley-city.ts';
import {WAVERLEY_FRONTAGE_OMIT_IDS} from '../src/waverley-frontage.ts';
import data from '../src/data/waverley-city.json' with {type:'json'};
const ground={heightAt:(x:number,z:number)=>8+x*.002+z*.003,rangeUnder:()=>({min:8,max:8,mean:8})};
test('the Scott Monument keeps its mapped height and its 98 cited OSM parts',()=>{
 assert.deepEqual(WAVERLEY_CITY_HEIGHTS,{scott:61.11});
 assert.match(JSON.stringify(WAVERLEY_CITY_SOURCES),/openstreetmap.org\/way\/39044819/);
 assert.equal(data.scott.parts.length,98);
 assert.ok(data.scott.parts.some(p=>p.id==='way/445166834'&&p.height===61.11&&p.minHeight===15&&p.roofHeight===40));
 assert.ok(WAVERLEY_CITY_OMIT_IDS.includes('way/39044819'));
 assert.equal(new Set([...WAVERLEY_CITY_OMIT_IDS,...WAVERLEY_FRONTAGE_OMIT_IDS]).size,100,'the two elements replace 100 distinct city blocks between them');
});
test('city landmarks are finite, one draw, and dispose what they own once',()=>{
 const built=buildWaverleyCityLandmarks(ground);assert.equal(built.stats.drawCalls,1);assert.ok(built.stats.triangles<40000);
 assert.deepEqual(built.omitBuildingIds,WAVERLEY_CITY_OMIT_IDS);
 let count=0,disposed=0;
 built.group.traverse((obj:THREE.Object3D)=>{if(obj instanceof THREE.Mesh){count++;const p=obj.geometry.getAttribute('position');for(let i=0;i<p.count;i++)for(const v of [p.getX(i),p.getY(i),p.getZ(i)])assert.ok(Number.isFinite(v));obj.geometry.addEventListener('dispose',()=>disposed++);}});
 assert.equal(count,built.stats.drawCalls);built.dispose();built.dispose();assert.equal(disposed,count);assert.equal(built.group.children.length,0);
});
test('Scott exact part heights use a common monument base and retain open undercroft',()=>{
 const built=buildWaverleyCityLandmarks(ground),scott=built.group.getObjectByName('waverley-scott-monument') as THREE.Mesh;
 scott.geometry.computeBoundingBox();assert.ok(Math.abs(scott.geometry.boundingBox!.max.y-(8+61.11))<1e-4);
 const part=data.scott.parts.find(p=>p.id==='way/445166834')!;
 const x=part.ring.reduce((s,p)=>s+p[0],0)/part.ring.length,z=part.ring.reduce((s,p)=>s+p[1],0)/part.ring.length;
 scott.updateMatrixWorld();const ray=new THREE.Raycaster(new THREE.Vector3(x,8+8,z),new THREE.Vector3(1,0,0),0,1);
 assert.equal(ray.intersectObject(scott).length,0,'mapped min_height leaves centre open below15m');built.dispose();
});
test('rendered Scott tint retains its sourced appearance',()=>{
 const built=buildWaverleyCityLandmarks(ground);
 try {
  const scott=built.group.getObjectByName('waverley-scott-monument') as THREE.Mesh;
  assert.equal((scott.material as THREE.MeshLambertMaterial).color.getHex(),0x51463d);
 } finally {built.dispose();}
});

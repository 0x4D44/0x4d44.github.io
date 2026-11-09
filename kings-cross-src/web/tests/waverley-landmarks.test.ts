import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWaverleyLandmarks,WAVERLEY_LANDMARK_HEIGHTS,WAVERLEY_LANDMARK_SOURCES,WAVERLEY_LANDMARK_OMIT_IDS} from '../src/waverley-landmarks.ts';
import data from '../src/data/waverley-landmarks.json' with {type:'json'};
const ground={heightAt:(x:number,z:number)=>8+x*.002+z*.003,rangeUnder:()=>({min:8,max:8,mean:8})};
test('published tower and dial dimensions retain primary citations',()=>{
 assert.deepEqual(WAVERLEY_LANDMARK_HEIGHTS,{scott:61.11,balmoral:58,clockDiameter:3.2});
 assert.match(JSON.stringify(WAVERLEY_LANDMARK_SOURCES),/historicenvironment.scot/);
 assert.match(JSON.stringify(WAVERLEY_LANDMARK_SOURCES),/smithofderby.com/);
 assert.equal(data.scott.parts.length,98);
 assert.ok(data.scott.parts.some(p=>p.id==='way/445166834'&&p.height===61.11&&p.minHeight===15&&p.roofHeight===40));
 assert.ok(WAVERLEY_LANDMARK_OMIT_IDS.includes('way/39044819'));
 assert.ok(!WAVERLEY_LANDMARK_OMIT_IDS.includes('relation/14213049'),'hotel mass remains');
});
test('landmarks keep mapped bridge layers, finite bounded geometry and owned disposal',()=>{
 assert.deepEqual(data.bridges.map(b=>[b.id,b.layer]),[['way/380552925',2],['way/377738788',1]]);
 const built=buildWaverleyLandmarks(ground);assert.ok(built.stats.drawCalls<=5);assert.ok(built.stats.triangles<40000);
 assert.equal(built.omitBuildingIds.length,100);
 let count=0,disposed=0;
 built.group.traverse((obj:THREE.Object3D)=>{if(obj instanceof THREE.Mesh){count++;const p=obj.geometry.getAttribute('position');for(let i=0;i<p.count;i++)for(const v of [p.getX(i),p.getY(i),p.getZ(i)])assert.ok(Number.isFinite(v));obj.geometry.addEventListener('dispose',()=>disposed++);}});
 assert.equal(count,built.stats.drawCalls);built.dispose();built.dispose();assert.equal(disposed,count);assert.equal(built.group.children.length,0);
});
test('Scott exact part heights use a common monument base and retain open undercroft',()=>{
 const built=buildWaverleyLandmarks(ground),scott=built.group.getObjectByName('waverley-scott-monument') as THREE.Mesh;
 scott.geometry.computeBoundingBox();assert.ok(Math.abs(scott.geometry.boundingBox!.max.y-(8+61.11))<1e-4);
 const part=data.scott.parts.find(p=>p.id==='way/445166834')!;
 const x=part.ring.reduce((s,p)=>s+p[0],0)/part.ring.length,z=part.ring.reduce((s,p)=>s+p[1],0)/part.ring.length;
 scott.updateMatrixWorld();const ray=new THREE.Raycaster(new THREE.Vector3(x,8+8,z),new THREE.Vector3(1,0,0),0,1);
 assert.equal(ray.intersectObject(scott).length,0,'mapped min_height leaves centre open below15m');built.dispose();
});
test('rendered Scott tint and Balmoral spire retain their sourced appearance and total height',()=>{
 const built=buildWaverleyLandmarks(ground);
 try {
  const scott=built.group.getObjectByName('waverley-scott-monument') as THREE.Mesh;
  assert.equal((scott.material as THREE.MeshLambertMaterial).color.getHex(),0x51463d);
  const spire=built.group.getObjectByName('waverley-balmoral-spire-and-hands') as THREE.Mesh;
  const north=[...data.balmoral.ring].sort((a,b)=>a[1]-b[1])[0];
  const sourcedBase=ground.heightAt(north[0],north[1]);spire.geometry.computeBoundingBox();
  assert.ok(Math.abs(spire.geometry.boundingBox!.max.y-sourcedBase-58)<1e-4,'actual geometry reaches the published 58m above its source seat');
 } finally {built.dispose();}
});
test('bridge decks use unwarped public context terrain instead of the flattened railway ground',()=>{
 const flat={heightAt:()=>-.2,rangeUnder:()=>({min:-.2,max:-.2,mean:-.2})};
 const context={heightAt:(x:number,z:number)=>8+x*.002+z*.003};
 const built=buildWaverleyLandmarks(flat,context);
 try {
  const mesh=built.group.getObjectByName('waverley-bridge-decks') as THREE.Mesh;
  mesh.geometry.computeBoundingBox();assert.ok(mesh.geometry.boundingBox!.min.y>6,'1m slab remains above the railway flattening');
  const p=mesh.geometry.getAttribute('position');
  for(const bridge of data.bridges){
   const byZ=[...bridge.ring].sort((a,b)=>a[1]-b[1]);
   for(const endpoint of [byZ[0],byZ.at(-1)!]){
    const expected=context.heightAt(endpoint[0],endpoint[1]);let found=false;
    for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-endpoint[0])<1e-4&&Math.abs(p.getZ(i)-endpoint[1])<1e-4&&Math.abs(p.getY(i)-expected)<1e-4)found=true;
    assert.ok(found,`${bridge.id} endpoint deck follows the unwarped source height`);
   }
  }
  assert.equal(built.stats.drawCalls,5);
 } finally {built.dispose();}
});

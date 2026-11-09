import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWaverleyFrontage,WAVERLEY_FRONTAGE_HEIGHTS,WAVERLEY_FRONTAGE_SOURCES,WAVERLEY_FRONTAGE_OMIT_IDS} from '../src/waverley-frontage.ts';
import data from '../src/data/waverley-frontage.json' with {type:'json'};
const ground={heightAt:(x:number,z:number)=>8+x*.002+z*.003,rangeUnder:()=>({min:8,max:8,mean:8})};
test('published tower and dial dimensions retain primary citations',()=>{
 assert.deepEqual(WAVERLEY_FRONTAGE_HEIGHTS,{balmoral:58,clockDiameter:3.2});
 assert.match(JSON.stringify(WAVERLEY_FRONTAGE_SOURCES),/historicenvironment.scot/);
 assert.match(JSON.stringify(WAVERLEY_FRONTAGE_SOURCES),/smithofderby.com/);
 assert.deepEqual(WAVERLEY_FRONTAGE_OMIT_IDS,['way/313744197']);
 assert.ok(!WAVERLEY_FRONTAGE_OMIT_IDS.includes('relation/14213049'),'hotel mass remains');
});
test('frontage keeps mapped bridge layers, finite bounded geometry and owned disposal',()=>{
 assert.deepEqual(data.bridges.map(b=>[b.id,b.layer]),[['way/380552925',2],['way/377738788',1]]);
 const built=buildWaverleyFrontage(ground);assert.equal(built.stats.drawCalls,4);assert.ok(built.stats.triangles<40000);
 assert.deepEqual(built.omitBuildingIds,WAVERLEY_FRONTAGE_OMIT_IDS);
 let count=0,disposed=0;
 built.group.traverse((obj:THREE.Object3D)=>{if(obj instanceof THREE.Mesh){count++;const p=obj.geometry.getAttribute('position');for(let i=0;i<p.count;i++)for(const v of [p.getX(i),p.getY(i),p.getZ(i)])assert.ok(Number.isFinite(v));obj.geometry.addEventListener('dispose',()=>disposed++);}});
 assert.equal(count,built.stats.drawCalls);built.dispose();built.dispose();assert.equal(disposed,count);assert.equal(built.group.children.length,0);
});
test('the Balmoral spire reaches its published total height above its source seat',()=>{
 const built=buildWaverleyFrontage(ground);
 try {
  const spire=built.group.getObjectByName('waverley-balmoral-spire-and-hands') as THREE.Mesh;
  const north=[...data.balmoral.ring].sort((a,b)=>a[1]-b[1])[0];
  const sourcedBase=ground.heightAt(north[0],north[1]);spire.geometry.computeBoundingBox();
  assert.ok(Math.abs(spire.geometry.boundingBox!.max.y-sourcedBase-58)<1e-4,'actual geometry reaches the published 58m above its source seat');
 } finally {built.dispose();}
});
test('bridge decks use unwarped public context terrain instead of the flattened railway ground',()=>{
 const flat={heightAt:()=>-.2,rangeUnder:()=>({min:-.2,max:-.2,mean:-.2})};
 const context={heightAt:(x:number,z:number)=>8+x*.002+z*.003};
 const built=buildWaverleyFrontage(flat,context);
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
  assert.equal(built.stats.drawCalls,4);
 } finally {built.dispose();}
});

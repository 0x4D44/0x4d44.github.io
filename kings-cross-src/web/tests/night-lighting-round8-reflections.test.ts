import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import * as THREE from 'three';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {reflectionProbe} from './lamp-reflection-probe.ts';

const built=buildWaverleyScene({lighting:false}),lamps=await loadWaverleyLamps(built.terrain.heightAt.bind(built.terrain),true,built.group);
built.group.updateMatrixWorld(true);lamps.group.updateMatrixWorld(true);after(()=>{lamps.dispose();built.dispose();});

test('the right Princes Street reflection remains on wet ground through y794 instead of truncating at y756',()=>{
 const camera=new THREE.PerspectiveCamera(60,1.6,.1,20000);camera.position.set(70,17.86,-185);camera.lookAt(55,43,-125);camera.updateMatrixWorld();
 const p=reflectionProbe(lamps.group.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh,camera,34);
 try{for(const y of [768,780,794]){
  const samples=Array.from({length:51},(_,i)=>p.at(1110+i*2,y)).filter(s=>s!==null),bright=samples.filter(s=>s.alpha>.025);
  assert.ok(bright.length>=2,`right tail y${y} must have a visible soft spine, not a black cutoff`);
  for(const hit of bright){assert.ok(hit.receiver[1]!>.2,'reflections remain inside the wet mask');assert.ok(Math.abs(hit.world[1]!-hit.receiver[0]!-.012)<.15,'the strip must follow the receiver rather than float above it');}
 }}finally{p.dispose();}
});

test('Market Street wet light has separate long vertical runs at frame scale without adding triangles',()=>{
 const camera=new THREE.PerspectiveCamera(60,1.6,.1,20000);camera.position.set(125.47,16.73,35);camera.lookAt(-40,8,10);camera.updateMatrixWorld();
 const mesh=lamps.group.getObjectByName('waverley-approach-lamps')!.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh;
 const tails=mesh.geometry.getAttribute('reflectionTail');assert.ok(tails,'long tails belong to specific road fittings');assert.equal(tails.getX(0),0,'North Bridge fittings retain their existing short reflection frame');assert.equal(tails.getX(12),64,'the longer rough tail is confined to the Market Street run');
 let long=0;for(const index of [10,12,15]){const p=reflectionProbe(mesh,camera,index);try{
  const rows:number[]=[];for(let y=330;y<440;y+=2){for(let x=160;x<260;x+=2){if((p.at(x,y)?.alpha??0)>.035){rows.push(y);break;}}}
  if(rows.length&&Math.max(...rows)-Math.min(...rows)>=40)long++;
 }finally{p.dispose();}}
 assert.ok(long>=2,`only ${long} resolved long runs; overlapping short reflections read as one 54x28 box`);
 assert.equal(lamps.counts().triangles,41992);assert.equal(lamps.counts().draws,10);
});

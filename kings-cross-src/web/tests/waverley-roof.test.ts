import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ridgeRoofBatches,WAVERLEY_ROOF_PROFILE} from '../src/waverley-roof.ts';
import type {Pt} from '../../core/geo.ts';
const outer:Pt[]=[[0,0],[36,0],[36,24],[0,24]],hole:Pt[]=[[13,6],[23,6],[23,18],[13,18]];
test('Waverley glazed roof is a symmetric transverse ridge-and-furrow profile below the reported height limit',()=>{
 const {glass,ribs}=ridgeRoofBatches(outer,[hole]);const ys=glass.positions.filter((_,i)=>i%3===1);
 assert.ok(Math.abs(Math.min(...ys)-8)<1e-6);assert.ok(Math.abs(Math.max(...ys)-10.4)<1e-6,'ASSUMED rise is geometric, not a flat texture');
 assert.ok(WAVERLEY_ROOF_PROFILE.gutter+WAVERLEY_ROOF_PROFILE.rise<12.8,'12.8 m is the reported limit, not the actual ridge height');
 assert.ok(ribs.triangles>0&&ribs.triangles<2000);
 for(let i=0;i<glass.positions.length;i+=3){const [x,y]=glass.positions.slice(i,i+3),phase=(x%12+12)%12;assert.ok(Math.abs(y-(8+2.4*(1-Math.abs(phase-6)/6)))<1e-5,'ridge is N–S; symmetric profile repeats along east–west');}
});
test('Waverley profiled glazing preserves the polygon area and hole, with no face bridging a gutter or ridge',()=>{
 for(const reverse of [false,true]){
  const {glass}=ridgeRoofBatches(reverse?[...outer].reverse():outer,[reverse?[...hole].reverse():hole]);let projectedArea=0;
  for(let i=0;i<glass.indices.length;i+=3){const vs=glass.indices.slice(i,i+3).map(n=>glass.positions.slice(n*3,n*3+3));const [a,b,c]=vs;projectedArea+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;assert.ok(Math.max(...vs.map(v=>v[0]))-Math.min(...vs.map(v=>v[0]))<=6+1e-6,'each face stays inside one roof pitch');}
  assert.ok(Math.abs(projectedArea-(36*24-10*12))<1e-5,'clipping retains exactly the OSM footprint minus its hole');
  const mesh=new THREE.Mesh(glass.build(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
  assert.equal(new THREE.Raycaster(new THREE.Vector3(18,100,12),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length,0);
  assert.ok(new THREE.Raycaster(new THREE.Vector3(6,100,12),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length>0);
  mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
 }
});

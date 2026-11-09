import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {stationCameras} from '../evidence.mjs';
import {buildShed,WESTERN_RANGE} from '../../web/src/shed.ts';
import {buildConcourse} from '../../web/src/concourse.ts';
import {concourseCanopy,shedLayout,shedToWorld,stationBuilding} from '../../core/station.ts';
const data=JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json',import.meta.url),'utf8'));
const s=shedLayout(data);
const point=(u,v,y)=>{const [x,z]=shedToWorld(s,u,v);return new THREE.Vector3(x,y,z);};

test('Western Range public-frontage view frames five southern bays and upper floors without hiding their scene',()=>{
 const c=stationCameras(data)['western-range-gateline'];
 assert.ok(c,'missing full southern public-frontage view');
 assert.ok(!c.hideScenery,'public facade evidence keeps the scene intact');
 const camera=new THREE.PerspectiveCamera(c.fov,1280/800,c.near,9000);
 camera.position.set(...c.pos);camera.lookAt(new THREE.Vector3(...c.target));camera.updateMatrixWorld(true);
 for(const v of [WESTERN_RANGE.v0,57.5]) for(const y of [0,WESTERN_RANGE.storeys*WESTERN_RANGE.storey]) {
   const p=point(-WESTERN_RANGE.depth-.01,v,y).project(camera);
   assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95&&p.z>-1&&p.z<1,`frontage point v=${v} y=${y} clipped: ${p.toArray()}`);
 }
 const scene=new THREE.Scene();scene.add(buildShed(s),buildConcourse(concourseCanopy(data),stationBuilding(data).pts,s));scene.updateMatrixWorld(true);
 for(const v of [12.1,20.1,28.1,36.1,44.1]) {
   const target=point(-WESTERN_RANGE.depth-.02,v,2),delta=target.clone().sub(camera.position);
   const hits=new THREE.Raycaster(camera.position,delta.clone().normalize(),0,delta.length()-.03).intersectObject(scene,true);
   assert.equal(hits.length,0,`view to southern gate ${v} occluded by ${hits[0]?.object.name}`);
 }
});

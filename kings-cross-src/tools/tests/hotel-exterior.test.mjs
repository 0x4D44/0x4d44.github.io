import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {greatNorthernHotelPlan,landmarkPlans} from '../../core/landmarks.ts';
import {concourseCanopy,shedLayout,stationBuilding} from '../../core/station.ts';
import {buildConcourse} from '../../web/src/concourse.ts';
import {landmarkGeometry} from '../../web/src/landmarks.ts';
import {cameraBuildingCollisions,cityBuildings,stationCameras} from '../evidence.mjs';
const data=JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json',import.meta.url),'utf8'));

test('hotel exterior camera frames its Pancras Road arches outside the concourse without hiding scenery',()=>{
 const hotel=greatNorthernHotelPlan(data),canopy=concourseCanopy(data),c=stationCameras(data)['great-northern-hotel'];
 assert.ok(Math.hypot(c.pos[0]-canopy.centre[0],c.pos[2]-canopy.centre[1])>canopy.radius,'hotel evidence camera must be outside the canopy');
 assert.ok(!c.hideScenery,'hotel evidence retains the complete scene');
 assert.deepEqual(cameraBuildingCollisions({hotel:c},cityBuildings(data)),[]);
 const camera=new THREE.PerspectiveCamera(c.fov??50,1280/800,c.near??.1,9000);
 camera.position.set(...c.pos);camera.lookAt(new THREE.Vector3(...c.target));camera.updateMatrixWorld(true);
 const roof=buildConcourse(canopy,stationBuilding(data).pts,shedLayout(data),[hotel.outline]);roof.updateMatrixWorld(true);
 // Include the neighbouring built landmarks: a footprint-clear point can still sit
 // below the projecting Barlow roof. The old 45 m camera did exactly that.
 const neighbours=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 for(const [i,parts] of landmarkGeometry(landmarkPlans(data)).entries()) for(const [name,batch] of Object.entries(parts)) {
   if(i===0) continue; // The hotel cornice/window trim belongs to the framed subject, not a neighbour.
   const mesh=new THREE.Mesh(batch.build(),material);mesh.name=`landmark-${i}-${name}`;neighbours.add(mesh);
 }
 neighbours.updateMatrixWorld(true);
 const facade=hotel.faces.find(f=>f.kind==='rear');
 for(const bay of facade.bays) {
   const dx=c.pos[0]-bay.at[0],dz=c.pos[2]-bay.at[1];
   assert.ok(dx*bay.normal[0]+dz*bay.normal[1]>10,'camera sees the exterior of the Pancras Road wall');
   for(const y of [.5,3.6,hotel.eaves]) {
     const target=new THREE.Vector3(bay.at[0]+bay.normal[0]*.25,y,bay.at[1]+bay.normal[1]*.25),p=target.clone().project(camera);
     assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95&&p.z>-1&&p.z<1,`hotel bay clipped at ${target.toArray()}`);
     const delta=target.clone().sub(camera.position),hits=new THREE.Raycaster(camera.position,delta.clone().normalize(),0,delta.length()-.03).intersectObject(roof,true);
     assert.equal(hits.length,0,`hotel detail blocked by ${hits[0]?.object.name}`);
     const otherHits=new THREE.Raycaster(camera.position,delta.clone().normalize(),0,delta.length()-.05).intersectObject(neighbours,true);
     assert.equal(otherHits.length,0,`hotel exterior blocked by ${otherHits[0]?.object.name} at ${otherHits[0]?.distance} m`);
   }
 }
});

test('hotel junction diagnostic retains the old view and shows paving at both former terrain wedges',()=>{
 const c=stationCameras(data)['concourse-hotel-junction'];
 assert.ok(c,'keep a fixed diagnostic of the hotel/concourse ground junction');
 const camera=new THREE.PerspectiveCamera(c.fov??50,1280/800,c.near??.1,9000);
 camera.position.set(...c.pos);camera.lookAt(new THREE.Vector3(...c.target));camera.updateMatrixWorld(true);
 const hotel=greatNorthernHotelPlan(data),group=buildConcourse(concourseCanopy(data),stationBuilding(data).pts,shedLayout(data),[hotel.outline]);
 group.updateMatrixWorld(true);
 const floor=group.getObjectByName('concourse-floor');
 for(const [x,y] of [[50,634],[1043,607]]) {
   const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x+.5)/1280*2-1,1-(y+.5)/800*2),camera);
   const hits=ray.intersectObject(floor);
   assert.ok(hits.length,`paving missing at old hotel wedge pixel ${x},${y}`);
   assert.ok(Math.abs(hits[0].point.y-.02)<1e-6,'the ground junction uses the unchanged paving height');
 }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {stationCameras} from '../evidence.mjs';
import {buildConcourse} from '../../web/src/concourse.ts';
import {concourseCanopy,shedLayout,stationBuilding} from '../../core/station.ts';
const data=JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json',import.meta.url),'utf8'));

test('concourse roof detail frames drawn members from below within nine metres',()=>{
 const c=stationCameras(data)['concourse-roof-detail'];
 assert.ok(c,'missing roof-member close view');
 const start=new THREE.Vector3(...c.pos),end=new THREE.Vector3(...c.target),delta=end.clone().sub(start);
 assert.ok(delta.length()>3&&delta.length()<9,`roof view is ${delta.length()}m away`);
 assert.ok(c.target[1]-c.pos[1]>3,'camera is below the roof');
 const model=buildConcourse(concourseCanopy(data),stationBuilding(data).pts,shedLayout(data));
 model.updateMatrixWorld(true);
 const hits=new THREE.Raycaster(start,delta.normalize(),0,9).intersectObject(model,true);
 assert.ok(hits.length,'close view must target actual drawn roof');
 assert.ok(['concourse-glass','concourse-panels','concourse-lattice','concourse-diagonals'].includes(hits[0].object.name),`aim hits ${hits[0]?.object.name}`);
 assert.ok(Math.abs(hits[0].distance-start.distanceTo(end))<.6,'the roof must fill the chosen close-view target, not sit far behind it');
});

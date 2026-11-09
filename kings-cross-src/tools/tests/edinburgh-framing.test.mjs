import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { platformCoachCamera, platformCameraCandidates, besideMappedPlatform } from '../edinburgh-framing.mjs';

function fixture() {
  const scene=new T.Scene(),coach=new T.Group();coach.name='car-0';
  const body=new T.Mesh(new T.BoxGeometry(2.8,3.1,25.4,1,2,12),new T.MeshBasicMaterial());body.name='body-shell';body.position.y=2.1;coach.add(body);scene.add(coach);
  const platform={id:'synthetic-platform',path:[[-12,-90],[-2,-90],[-2,90],[-12,90]]};
  const floor=new T.Mesh(new T.BoxGeometry(10,.915,180),new T.MeshBasicMaterial());floor.position.set(-7,.4575,0);scene.add(floor);
  const camera=new T.PerspectiveCamera(55,1.44,.03,1000),controls={target:new T.Vector3(),update(){}};
  return {scene,coach,platform,camera,controls};
}

test('platform coach view fits the entire coach and visible mapped platform at a real stand-back distance',()=>{
  const {scene,coach,platform,camera,controls}=fixture();
  const view=platformCoachCamera(T,scene,camera,controls,coach,[platform]);
  assert.ok(view.distanceM>15,`coach distance ${view.distanceM} m crops the body`);
  assert.equal(view.visibility.clear,true);
  assert.equal(view.platform.id,platform.id);
  assert.ok(view.context.coachCorners.every(p=>Math.abs(p[0])<=.84&&Math.abs(p[1])<=.84));
  assert.ok(view.context.platformSamples.length>=4);
  assert.ok(view.context.platformSamples.every(p=>Math.abs(p[0])<=.9&&Math.abs(p[1])<=.9));
});

test('platform candidates require adjacent mapped polygons and never stand on track',()=>{
 const {scene,coach,platform}=fixture();scene.updateMatrixWorld(true);
 const candidates=platformCameraCandidates(T,coach,[platform]);assert.ok(candidates.length);
 assert.ok(candidates.every(c=>c.position[0]<-2.5&&c.position[0]>-11.5));
 assert.deepEqual(platformCameraCandidates(T,coach,[{...platform,path:platform.path.map(([x,z])=>[x-100,z])}]),[]);
});

test('opaque coach obstruction remains fatal with whole-coach framing',()=>{
 const {scene,coach,platform,camera,controls}=fixture();
 const wall=new T.Mesh(new T.BoxGeometry(.3,12,190),new T.MeshBasicMaterial());wall.position.set(-1.8,6,0);scene.add(wall);
 assert.throws(()=>platformCoachCamera(T,scene,camera,controls,coach,[platform]),/occluded/);
});

test('a platform-associated berth does not establish physical platform proximity',()=>{
 const {platform}=fixture();
 assert.equal(besideMappedPlatform([0,0],[platform]),true);
 assert.equal(besideMappedPlatform([0,180],[platform]),false);
 assert.equal(besideMappedPlatform([-7,0],[platform]),false);
});

test('mapped-platform framing follows coach world rotation and translation',()=>{
 const {scene,coach,platform,camera,controls}=fixture();
 const angle=.7,dx=120,dz=-200;
 const transform=([x,z])=>[dx+Math.cos(angle)*x+Math.sin(angle)*z,dz-Math.sin(angle)*x+Math.cos(angle)*z];
 coach.position.set(dx,0,dz);coach.rotation.y=angle;
 const floor=scene.children.find(o=>o.isMesh);floor.position.set(...[transform([-7,0])[0],.4575,transform([-7,0])[1]]);floor.rotation.y=angle;
 const shifted={...platform,path:platform.path.map(transform)};
 const view=platformCoachCamera(T,scene,camera,controls,coach,[shifted]);
 assert.equal(view.visibility.clear,true);
 assert.ok(view.distanceM>15);
 assert.equal(view.platform.id,platform.id);
});

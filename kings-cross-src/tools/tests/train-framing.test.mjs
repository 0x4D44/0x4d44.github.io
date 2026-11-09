import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {followTrainCamera,inspectTrainFrame} from '../train-framing.mjs';
function fixture(){
 const scene=new T.Scene(),group=new T.Group(),coach=new T.Group();coach.name='car-0';group.add(coach);scene.add(group);
 const shell=new T.Mesh(new T.BoxGeometry(2.7,3.1,26,1,4,26),new T.MeshBasicMaterial());shell.name='body-shell';shell.position.set(0,2,13);coach.add(shell);
 const camera=new T.PerspectiveCamera(55,1.6,.03,2000),controls={target:new T.Vector3(),update(){camera.lookAt(this.target);}},ground={heightAt:()=>0};
 const wall=(x,name)=>{const mesh=new T.Mesh(new T.BoxGeometry(.3,10,80),new T.MeshBasicMaterial());mesh.position.set(x,5,13);mesh.name=name;scene.add(mesh);};
 wall(15,'platform-screen');wall(-10,'adjacent-train');return {scene,group,camera,controls,ground};
}
test('bounded follow alternatives clear platform furniture from above while keeping the leading coach large',()=>{
 const f=fixture(),results=[];
 for(let candidate=0;candidate<6;candidate++){
  const view=followTrainCamera(T,f.camera,f.controls,f.group,[0,0],f.ground,candidate);
  assert.equal(view.coach.name,'car-0');assert.ok(view.camera.distanceM<75);
  results.push(inspectTrainFrame(T,f.scene,f.camera,view.coach,f.ground,{minScreenSpan:.3,minVerticalSpan:.08}));
 }
 assert.equal(results[0].clear,false);assert.match(results[0].blocker,/platform-screen|adjacent-train/);
 assert.ok(results.some(v=>v.clear),JSON.stringify(results));
 const closed=new T.Mesh(new T.BoxGeometry(200,1,200),new T.MeshBasicMaterial({side:T.DoubleSide}));closed.position.set(0,5,13);closed.name='solid-cover';f.scene.add(closed);
 for(let candidate=0;candidate<6;candidate++){
  const view=followTrainCamera(T,f.camera,f.controls,f.group,[0,0],f.ground,candidate);
  assert.equal(inspectTrainFrame(T,f.scene,f.camera,view.coach,f.ground,{minScreenSpan:.3,minVerticalSpan:.08}).clear,false);
 }
});

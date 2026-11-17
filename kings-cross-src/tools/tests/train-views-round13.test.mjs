import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as T from 'three';
import {describeFormation} from '../train-capture.mjs';
import * as F from '../train-framing.mjs';

test('round 13 replacement roof poses show both cab-car roofs in opposing longitudinal directions from the same side',()=>{
  const f=describeFormation('gc180x5'),views=F.planCatalogueViews(f),front=views.find(v=>v.suffix==='roof-front'),rear=views.find(v=>v.suffix==='roof-rear');
  assert.ok(front.target[2]<f.cars[0].end,'front cab-car roof, not the repeated middle car');
  assert.ok(rear.target[2]>f.cars.at(-1).start,'rear cab-car roof');
  assert.ok(front.eye[0]>0&&rear.eye[0]>0,'do not cancel the direction change by a 180-degree symmetric eye');
  assert.ok(front.eye[2]<front.target[2]&&rear.eye[2]>rear.target[2]);
  assert.equal(front.fov,50);assert.equal(rear.fov,50);assert.equal(front.eye[1],8);assert.equal(rear.eye[1],8);
});

function fixture(){
  const scene=new T.Scene(),group=new T.Group(),car=new T.Group();car.name='car-0';group.add(car);scene.add(group);
  const mesh=new T.Mesh(new T.BoxGeometry(2.7,3.1,12),new T.MeshBasicMaterial());mesh.name='body-shell';mesh.position.set(0,2,6);car.add(mesh);
  const camera=new T.PerspectiveCamera(50,1.6,.03,3000),controls={target:new T.Vector3(),update(){}};
  const view={id:'V10',suffix:'station-150m',eye:[12,2.6,149],target:[0,1.7,1.5],fov:50,near:.1,
    region:{min:[-1.6,1,0],max:[1.6,3.5,12]},focus:{name:'cab',local:[0,1.7,1.5]}};
  const inspect=v=>{F.setCatalogueView(T,camera,controls,group,v);return F.inspectCatalogueView(T,scene,camera,group,{heightAt:()=>0},v,F.stationCheckOptions());};
  return {scene,group,camera,controls,view,inspect};
}

test('round 13 station cab checks reject a camera behind the leading cab even if some leading-car side is visible',()=>{
  const f=fixture(),rear=f.inspect(f.view);
  assert.equal(rear.clear,false,'a rearward viewpoint must not present the near rear cab as the 150 m cab');
  assert.match(rear.reason,/leading cab|nose side/);
  const frontEye=[106.066017,2.6,-104.566017],front=f.inspect({...f.view,eye:frontEye});assert.equal(front.clear,true,front.reason);
  const placement={id:'synthetic',position:[0,0,0],rotationY:0,views:[{...f.view,focusWorld:f.view.target,
    candidates:[{eye:f.view.eye,near:.1,azimuthDeg:5,platform:'synthetic'},{eye:frontEye,near:.1,azimuthDeg:135,platform:'synthetic'}]}]};
  const [report]=F.searchStation(T,{scene:f.scene,camera:f.camera,controls:f.controls,group:f.group,ground:{heightAt:()=>0}},[placement]);
  assert.equal(report.views['station-150m'].accepted?.azimuthDeg,135,'search and final inspection both require the leading cab');
  assert.equal(report.views['station-150m'].tested,2);
});

test('round 13 station checks include number-board sprites, and the search chooses an unoccluded azimuth',()=>{
  const f=fixture();
  const sign=new T.Sprite(new T.SpriteMaterial());sign.name='platform-number';sign.position.set(5,2.5,1.5);sign.scale.set(4,4,1);f.scene.add(sign);
  const side={...f.view,suffix:'station-75m',eye:[12,2.6,1.5],region:{min:[-1.6,1,0],max:[1.6,3.5,3]}};
  const blocked=f.inspect(side);assert.equal(blocked.clear,false,'drawn number board occludes the cab');assert.match(blocked.blocker,/platform-number/);
  const placement={id:'synthetic',position:[0,0,0],rotationY:0,views:[{...side,focusWorld:side.target,
    candidates:[{eye:side.eye,near:.1,azimuthDeg:90,platform:'synthetic'},{eye:[-12,2.6,1.5],near:.1,azimuthDeg:270,platform:'synthetic'}]}]};
  const [report]=F.searchStation(T,{scene:f.scene,camera:f.camera,controls:f.controls,group:f.group,ground:{heightAt:()=>0}},[placement]);
  assert.equal(report.views['station-75m'].accepted?.azimuthDeg,270,'try the next camera when a sprite blocks the first');
  assert.equal(report.views['station-75m'].tested,2);
});

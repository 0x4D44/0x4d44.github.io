import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {portalTrainCamera,inspectPortalEntryFrame} from '../train-framing.mjs';
const portal={origin:[0,0],axis:[0,1],across:[1,0],bore:{lateral:0,width:10}};
function fixture({advance=200,frame=true}={}){
 const scene=new T.Scene(),group=new T.Group();scene.add(group);
 for(let i=0;i<9;i++){
  const coach=new T.Group();coach.name=`car-${i}`;coach.position.z=-8-26*i-13;
  const shell=new T.Mesh(new T.BoxGeometry(3,3.6,25.5),new T.MeshBasicMaterial());shell.name='body-shell';shell.position.y=2;coach.add(shell);group.add(coach);
 }
 const cover=new T.Group();scene.add(cover);
 const box=(x,y,z,sx,sy,sz,name)=>{const m=new T.Mesh(new T.BoxGeometry(sx,sy,sz),new T.MeshBasicMaterial());m.position.set(x,y,z);m.name=name;cover.add(m);return m;};
 box(0,8,180,50,4,360,'solid-hill-roof');box(-12.5,3,180,15,6,360,'left-hill');box(12.5,3,180,15,6,360,'right-hill');
 box(0,4,8.2,2000,8,.2,'solid-recess-back'); // The page closes the short drawn recess into opaque ground.
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,0,0,10,2.5,0,0,2.5,0,10],3));
 const track=new T.LineSegments(geometry,new T.LineBasicMaterial());track.name='track-tunnel';scene.add(track);
 group.position.z=advance;
 const camera=new T.PerspectiveCamera(55,1280/800,.03,2000),controls={enableDamping:false,target:new T.Vector3(),update(){},minDistance:0,maxPolarAngle:Math.PI},ground={heightAt:()=>-.2};
 const view=frame?portalTrainCamera(T,camera,controls,group,[0,advance-8],ground,portal,2):undefined;
 return {scene,group,cover,track,camera,controls,ground,view,box};
}
const inspect=(f,options)=>inspectPortalEntryFrame(T,f.scene,f.camera,f.group,f.ground,portal,options);
test('near-axis camera frames all remaining exterior body and aperture from thirty to eighty metres out',()=>{
 const f=fixture(),v=inspect(f,{initial:true});assert.equal(v.clear,true,JSON.stringify(v));
 const physicalExteriorM=-new T.Box3().setFromObject(f.group).min.z;
 assert.ok(Math.abs(v.outsideLengthM-physicalExteriorM)<2.1,'longitudinal bins measure the real exterior length within one bin');
 assert.ok(v.visibleLengthM>=v.outsideLengthM);assert.equal(v.track.visible,true);
 assert.ok(f.camera.position.z>=-80&&f.camera.position.z<=-30);assert.ok(Math.abs(f.camera.position.x)<=16);assert.ok(f.camera.position.y<=4);
 const position=f.camera.position.toArray(),target=f.controls.target.toArray();f.group.position.z=220;inspect(f);assert.deepEqual(f.camera.position.toArray(),position);assert.deepEqual(f.controls.target.toArray(),target);
});
test('an early full formation is rejected rather than clipped or framed from across the city',()=>{
 const f=fixture({advance:0,frame:false});
 assert.throws(()=>portalTrainCamera(T,f.camera,f.controls,f.group,[0,-8],f.ground,portal,2),/exterior body cannot fit/);
 const wide=fixture({frame:false});wide.group.children[8].position.x=-40;wide.group.children[7].position.x=40;
 assert.throws(()=>portalTrainCamera(T,wide.camera,wide.controls,wide.group,[0,192],wide.ground,portal,2),/exterior body cannot fit/,
  'all exterior coaches must fit horizontally as well as being in front of the camera');
});
test('solid hill hides entering coaches while exterior body stays visible and visible length decreases',()=>{
 const f=fixture(),lengths=[];
 for(const advance of [200,208,216,224,250]){f.group.position.z=advance;const v=inspect(f,{initial:advance===200});assert.equal(v.clear,true,JSON.stringify(v));assert.equal(v.buriedVisibleLengthM,0);lengths.push(v.visibleLengthM);}
 for(let i=1;i<lengths.length;i++)assert.ok(lengths[i]<lengths[i-1],JSON.stringify(lengths));assert.equal(lengths.at(-1),0);
});
test('outside train cannot vanish, clip or disappear behind unrelated solid scenery',()=>{
 const f=fixture();f.group.children[8].visible=false;assert.match(inspect(f).reason,/hidden/);f.group.children[8].visible=true;
 f.box(0,2,-15,2000,20,.4,'exterior-solid-wall');const blocked=inspect(f);assert.equal(blocked.clear,false);
 assert.match(blocked.blocker,/exterior-solid-wall/);assert.ok(blocked.occluder.distanceM<blocked.occluder.targetDistanceM);
 assert.equal(blocked.occluder.chain[0].name,'exterior-solid-wall');
 const clipped=fixture();clipped.camera.fov=2;clipped.camera.updateProjectionMatrix();assert.match(inspect(clipped).reason,/outside frame/);
});
test('transparent and missing cover fail when deep buried body passes through visibly',()=>{
 for(const transparent of [false,true]){const f=fixture();f.group.position.z=230;if(transparent)f.cover.traverse(o=>{if(o.isMesh){o.material.transparent=true;o.material.opacity=.1;}});else f.cover.visible=false;
 const v=inspect(f);assert.equal(v.clear,false);assert.match(v.reason,/buried.*visible/);assert.ok(v.buriedVisibleLengthM>0);}
});
test('solid portal face and fake, off-bore or depth-disabled track cannot establish an aperture',()=>{
 const f=fixture();f.box(0,3,0,10,6,.2,'solid-face');assert.match(inspect(f,{initial:true}).reason,/track/);
 for(const mutate of [f=>f.track.visible=false,f=>f.track.name='unrelated-grid',f=>f.track.material.depthTest=false,f=>f.track.position.x=20,
  f=>{f.track.position.x=20;for(const side of ['left-hill','right-hill'])f.cover.getObjectByName(side).visible=false;},f=>f.track.position.y=3,
  f=>{f.track.geometry.attributes.position.setZ(1,3);f.track.geometry.attributes.position.setZ(3,3);}]){
  const f=fixture();mutate(f);assert.match(inspect(f,{initial:true}).reason,/track/);
 }
});
test('camera clearance is measured from actual terrain and invalid terrain fails',()=>{
 const f=fixture(),ground={heightAt:(x,z)=>20+Math.abs(x)*.002+Math.abs(z)*.001};
 const v=portalTrainCamera(T,f.camera,f.controls,f.group,[0,-8],ground,portal,2);assert.ok(v.camera.position[1]>=ground.heightAt(v.camera.position[0],v.camera.position[2])+.5-1e-9);
 assert.throws(()=>portalTrainCamera(T,f.camera,f.controls,f.group,[0,-8],{heightAt:()=>NaN},portal),/terrain/);
 f.camera.position.y=-1;assert.match(inspect(f).reason,/ground clearance/);
});

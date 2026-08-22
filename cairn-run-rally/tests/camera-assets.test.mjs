import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { buildStage, sampleStage } from '../src/stage.js';
import { RallyCar } from '../src/vehicle.js';
import { ChaseCamera } from '../src/world.js';
import { wrapAngle } from '../src/math.js';
import { CATALOG } from '../src/content.js';
import { paceNoteSources } from '../src/audio.js';

const stage=buildStage();
test('chase camera remains smooth, speed-aware, and above terrain',()=>{
 const car=new RallyCar(stage),camera=new ChaseCamera(stage,car);camera.reset(car);
 const slowDistance=Math.hypot(camera.position.x-car.x,camera.position.z-car.z);
 const road=sampleStage(stage,600);car.reset(600,true);car.vx=Math.sin(road.heading)*38;car.vz=Math.cos(road.heading)*38;
 for(let i=0;i<120;i++)camera.update(car,1/120);
 const fastDistance=Math.hypot(camera.position.x-car.x,camera.position.z-car.z);
 assert.ok(fastDistance>slowDistance,`${fastDistance} <= ${slowDistance}`);assert.ok(camera.fov>=68&&camera.fov<=74);
 const behind=sampleStage(stage,Math.max(0,car.progress-fastDistance));assert.ok(camera.position.y>=behind.y+1.1);
 const priorYaw=camera.yaw;car.yaw+=1.2;camera.update(car,1/120);assert.ok(Math.abs(camera.yaw-priorYaw)<.2,'camera snapped to a crash rotation');
 for(const v of Object.values(camera.position))assert.ok(Number.isFinite(v));
});

test('all authored spoken pace notes are packaged locally in broad browser formats',async()=>{
 for(const stageSpec of CATALOG.stages){
  for(const note of stageSpec.notes){
   for(const extension of ['mp3','ogg']){
    const path=paceNoteSources(stageSpec,note,extension).find(candidate=>candidate.includes(`/${stageSpec.id}/`)&&candidate.endsWith(`.${extension}`));
    assert.ok(path,`${stageSpec.id}/${note.id} has no ${extension} source`);
    const info=await stat(new URL(`../${path.replace(/^\.\//,'')}`,import.meta.url));
    assert.ok(info.size>3000,`${path} is missing or empty`);
   }
  }
 }
});

test('shell exposes the complete minimal game loop and controls',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 for(const id of ['title-screen','start-button','settings-screen','hud','countdown','pause-screen','result-screen','retry-button'])assert.match(html,new RegExp(`id="${id}"`));
 for(const control of ['ACCEL / BRAKE','STEER','ARROWS','SPACE','RESTART','GAMEPAD'])assert.ok(html.includes(control));
 for(const id of ['damage-engine','damage-steering','damage-suspension','damage-brakes','damage-body'])assert.match(html,new RegExp(`id=\"${id}\"`));
});


test('camera preserves road context during a large controllable slide',()=>{
 const car=new RallyCar(stage),road=sampleStage(stage,3600),camera=new ChaseCamera(stage,car);car.reset(3600,true);car.yaw=road.heading+.95;car.vx=Math.sin(road.heading)*27;car.vz=Math.cos(road.heading)*27;car.slipAmount=1;camera.reset(car);
 for(let i=0;i<120;i++)camera.update(car,1/120);
 const cameraError=Math.abs(wrapAngle(camera.yaw-road.heading)),bodyError=Math.abs(wrapAngle(car.yaw-road.heading));
 assert.ok(cameraError<bodyError*.65,`camera ${cameraError}, body ${bodyError}`);
});

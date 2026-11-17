import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {addCity} from '../src/city.ts';
import {addLandmarks} from '../src/landmarks.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {urbanLampOptions} from '../src/station-lamps.ts';
import {LAMP_KIND,type LampSpot} from '../../core/streetlights.ts';
import {Glsl} from './glsl.ts';

const read=(name:string)=>JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
function shader(material:THREE.Material){const lib=THREE.ShaderLib.basic!,s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};material.onBeforeCompile(s as never,undefined as never);return s;}
function block(source:string,name:string){const code=source.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0];assert.ok(code,name);return code;}

test('KX window and lamp reflections only add light, including dark panes over already lit paving',()=>{
 const scene=new THREE.Scene(),landmarks=addLandmarks(scene,read('kx-track'));
 const city=addCity(scene,read('kx-track'),read('kx-city'),{nightEffects:true,trees:false,hidden:new Set(landmarks.excludeIds)});
 try{
  for(const name of ['street-lamp-reflections','kx-front-glazing-reflections','kx-front-amber-reflections','kx-midland-window-reflections']){
   const mesh=city.lights!.group.getObjectByName(name) as THREE.InstancedMesh,material=mesh.material as THREE.MeshBasicMaterial;
   const blend=(background:number[],source:number[],alpha:number)=>background.map((c,i)=>source[i]!*alpha+c*(material.blending===THREE.AdditiveBlending?1:1-alpha));
   for(const background of [[.01,.02,.03],[.2,.1,.04],[.5,.5,.5]])for(const alpha of [0,.1,.5,1])for(const source of [[0,0,0],[.12,.08,.02],[.3,.4,.5]]){
    const result=blend(background,source,alpha);
    assert.ok(result.every((v,i)=>v>=background[i]!),`${name}: no source, including an unlit pane, may erase the road`);
   }
   assert.equal(material.blending,THREE.AdditiveBlending);
  }
  const plain=createStreetLights([{x:0,y:0,z:0,height:9,yaw:0,kind:LAMP_KIND.sodium,slope:[0,0]}],urbanLampOptions());
  try{assert.equal(((plain.group.getObjectByName('street-lamp-reflections') as THREE.Mesh).material as THREE.Material).blending,THREE.NormalBlending,'remote/default reflection blending stays exact');}finally{plain.dispose();}
 }finally{city.dispose();landmarks.dispose();}
});

test('KX pool colour separates white LEDs from sodium and adds a bounded under-head patch without darkening or shrinking the road',()=>{
 const city=addCity(new THREE.Scene(),read('kx-track'),read('kx-city'),{nightEffects:true,trees:false});
 const spots:LampSpot[]=[LAMP_KIND.sodium,LAMP_KIND.warm,LAMP_KIND.cool].map(kind=>({x:0,y:0,z:0,height:9,yaw:0,kind,slope:[0,0]}));
 const remote=createStreetLights(spots,urbanLampOptions());
 try{
  const pools=city.lights!.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh,beam=pools.geometry.getAttribute('poolBeam'),s=shader(pools.material as THREE.Material),code=block(s.fragmentShader,'pool-source-colour');
  const colour=new THREE.Color();
  const sample=(kind:number,r:number)=>{
   const i=Array.from({length:beam.count},(_,j)=>j).find(j=>beam.getZ(j)===kind&&!beam.getW(j))!;pools.getColorAt(i,colour);
   const base=colour.toArray(),e={vars:{beamPosition:[r,0],vPoolBeam:[0,-1,kind,0],gl_FragColor:[...base,1]}};
   new Glsl('').run(code,e);return {base,rgb:e.vars.gl_FragColor.slice(0,3)};
  };
  const luminance=(rgb:number[])=>.2126*rgb[0]!+.7152*rgb[1]!+.0722*rgb[2]!;
  for(const kind of [LAMP_KIND.sodium,LAMP_KIND.warm,LAMP_KIND.cool]){
   const centre=sample(kind,0),gap=sample(kind,.8);
   for(const radius of [0,.2,.5,.8,1,1.6]){const at=sample(kind,radius);assert.ok(at.rgb.every((v,i)=>v>=at.base[i]!-1e-7),'neither colour correction nor the head patch subtracts any accepted pool channel');assert.ok(Math.max(...at.rgb)<=.4,'the patch has a bounded peak');}
   assert.ok(luminance(centre.rgb)>1.45*luminance(gap.rgb),'a head must produce a bright local patch above its continuous road skirt');
   if(kind===LAMP_KIND.sodium){assert.ok(gap.rgb[2]!>=gap.rgb[0]!*.5,'the road skirt is warm grey rather than a saturated amber carpet');assert.ok(centre.rgb[0]!>centre.rgb[2]!*2.5,'the under-head sodium patch remains golden orange');}
   else{assert.ok(Math.max(...centre.rgb)-Math.min(...centre.rgb)<1e-6,'LED pools are neutral white');assert.ok(Math.max(...gap.rgb)-Math.min(...gap.rgb)<1e-6);}
  }
  // The shape/alpha program is still the round-nine footprint, including
  // its old radial coverage and larger road beam. This change alters RGB only.
  assert.ok(!code.includes('gl_FragColor.a'));assert.equal((pools.material as THREE.Material).blending,THREE.NormalBlending);
  const remoteShader=shader((remote.group.getObjectByName('street-lamp-pools') as THREE.Mesh).material as THREE.Material);
  assert.ok(!remoteShader.fragmentShader.includes('// pool-source-colour-begin'),'Waverley/Perth/default optics do not receive KX colour grading');
 }finally{city.dispose();remote.dispose();}
});

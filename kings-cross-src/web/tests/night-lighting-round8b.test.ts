import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {addLandmarks} from '../src/landmarks.ts';
import {addRoofShade} from '../src/lighting.ts';
import {addCity} from '../src/city.ts';
import {Glsl} from './glsl.ts';

const data=JSON.parse(readFileSync(new URL('../src/data/kx-track.json',import.meta.url),'utf8'));
const cityData=JSON.parse(readFileSync(new URL('../src/data/kx-city.json',import.meta.url),'utf8'));
function shader(material:THREE.Material){const lib=THREE.ShaderLib[material.type==='MeshLambertMaterial'?'lambert':'basic']!;
 const s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};material.onBeforeCompile(s as never,undefined as never);return s;}

test('Midland top-floor piers and tower retain a warm textured brick radiance floor below the arcade',()=>{
 const built=addLandmarks(new THREE.Scene(),data);
 try{
  const material=(built.group.getObjectByName('landmarks-brickRed') as THREE.Mesh).material as THREE.MeshLambertMaterial;addRoofShade(material);
  const s=shader(material),start=s.fragmentShader.indexOf('// midland-brick-floor-begin'),end=s.fragmentShader.indexOf('// midland-brick-floor-end');
  assert.ok(start>=0&&end>start,'the scaled FLOOD term alone crushes tower and upper-floor brick to black');
  const code=s.fragmentShader.slice(start+'// midland-brick-floor-begin'.length,end).replace(/\bFLOOD\b/g,String(material.defines!.FLOOD));
  const at=(height:number,night=1,scope=1)=>{
   const vars={vMidlandHeight:height,midlandLevel:night*scope,midlandUpper:THREE.MathUtils.smoothstep(height,6,18),diffuseColor:[.4,.12,.05,1],totalEmissiveRadiance:[0,0,0]};new Glsl('').run(code,{vars});return vars.totalEmissiveRadiance;
  };
  // Radiance/albedo, not a claim of GPU pixel brightness. The actual frozen
  // pixels hit the upper pier at 19.43m and the tower face at 25.61m.
  for(const height of [16.1,19.43]){const c=at(height);assert.ok(c[0]!/.4>=.012&&c[1]!/.12>=.018,'top-floor brick must keep a visible warm fill, even without incident moonlight');}
  for(const height of [25.61,35,45]){const c=at(height);assert.ok(c[0]!/.4>=.006&&c[1]!/.12>=.006,'tower brick must retain its own colour rather than become a cut-out');}
  assert.ok(at(19.43)[0]!>at(25.61)[0]!*1.6,'the lower top-floor wash stays brighter than the tower');
  assert.ok(at(19.43)[0]!/.4<.022,'upper-wall uplight remains far below the 0.158 arcade flood at 3m');
  for(const h of [3,19.43,25.61]){assert.deepEqual(at(h,0),[0,0,0],'day has no added floor');assert.deepEqual(at(h,1,0),[0,0,0],'hotel and Barlow keep their original lighting');}
  assert.deepEqual(at(3),[0,0,0],'the lit arcade stays exact');
 }finally{built.dispose();}
});

test('production KX street pools restore the pre-round-eight extent and radial falloff',()=>{
 const city=addCity(new THREE.Scene(),data,cityData,{nightEffects:true,trees:false});
 try{
  const pools=city.lights!.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
  assert.ok(!pools.geometry.hasAttribute('poolRoadDirection'),'production must restore BASE pools, not retain the smaller road-shape footprint');
  const s=shader(pools.material as THREE.Material);
  assert.ok(!s.vertexShader.includes('// pool-road-shape-begin'),'the whole production profile, including its old radius, is restored');
  const code=s.fragmentShader.split('// pool-profile-begin')[1]!.split('// pool-profile-end')[0]!;
  for(const r of [0,.2,.4,.6,.8,.95,1])for(const angle of [0,.4,1.2,Math.PI/2]){
   const vars={vPoolUv:[.5+.5*r*Math.cos(angle),.5+.5*r*Math.sin(angle)],vPoolLine:0,gl_FragColor:[1,1,1,1]};new Glsl('').run(code,{vars});
   const expected=Math.pow(1+.8*r*r,-1.5)*(1-THREE.MathUtils.smoothstep(r,.55,1));
   assert.ok(Math.abs(vars.gl_FragColor[3]!-expected)<1e-7,`BASE radial falloff is preserved at radius ${r}`);
  }
  city.lights!.setLevel(0);assert.equal(pools.visible,false);
 }finally{city.dispose();}
});
